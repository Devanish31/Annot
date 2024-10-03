#app.py flask app
import os
import cv2
import torch
from flask import Flask, request, jsonify, send_from_directory, url_for
from flask_cors import CORS
from sam2.build_sam import build_sam2_video_predictor
import numpy as np
import sys
import threading
from modules.Annotation import AnnotationModule

# Set directories for uploads and frames
UPLOAD_FOLDER = 'uploads/'
FRAME_FOLDER = 'frames/'

# Initilize the Flask app
app = Flask(__name__)
CORS(app)

# Ensure the upload and frame directories exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

if not os.path.exists(FRAME_FOLDER):
    os.makedirs(FRAME_FOLDER)

# Initialize the Annotation module
current_dir = os.path.dirname(__file__)
sam2_checkpoint = os.path.join(current_dir, '..', 'sam2_hiera_large.pt')
model_cfg = os.path.join(current_dir, '..', 'sam2_hiera_l.yaml')
device = "cpu"
annotator = AnnotationModule(model_cfg, sam2_checkpoint, device=device)

# Route to handle video upload
import threading

@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    video = request.files['video']
    video_path = os.path.join(UPLOAD_FOLDER, video.filename)
    video.save(video_path)

    # Extract frames using AnnotationModule
    annotator.video_to_frames(video_path)
    print(f"video_path: {video_path}")

    # Get the list of extracted frames (first frame to return)
    # Filter out non-image files (like .mp4) and only include image files (jpg, jpeg, png)
    frame_files = sorted([f for f in os.listdir(annotator.frame_folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    print(f"frame_files: {frame_files}")
    
    # Check if frames were extracted
    if frame_files:
        # Start the inference initialization in a separate thread
        threading.Thread(target=annotator.init_inference_state, args=(annotator.frame_folder,)).start()
        
        # Construct full URLs for frames
        frame_urls = [url_for('get_frame', filename=frame, _external=True) for frame in frame_files]
        
        # Return the response immediately to display the frames
        return jsonify({
            'message': 'Video uploaded and frames extracted. Inference state is initializing in the background.',
            'frames': frame_urls
        }), 200
    else:
        return jsonify({'error': 'No frames extracted'}), 500

# Route to get the first frame
@app.route('/frames/<filename>')
def get_frame(filename):
    return send_from_directory(annotator.frame_folder, filename)
    
@app.route('/predict_mask', methods=['POST'])
def predict_mask():
    data = request.json
    object_id = data.get('object_id')
    frame_idx = data.get('frame_idx')
    points = data.get('points', [])  # List of points with x, y, label
    
    if not object_id or frame_idx is None or not points:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    # Log the incoming data
    print(f"Object ID: {object_id}, Frame Index: {frame_idx}, Points: {points}")

    try:
        # Prepare points and labels as NumPy arrays
        points_np = np.array([(p['x'], p['y']) for p in points], dtype=np.float32)
        labels_np = np.array([p['label'] for p in points], dtype=np.int32)

        # Print logs for debugging
        print(points_np)
        print(labels_np)
        print(frame_idx)
        print(object_id)

        print(annotator.frame_folder)
        #print(annotator.inference_state)

        #if annotator.inference_state is None:
        #    threading.Thread(target=annotator.init_inference_state, args=(annotator.frame_folder,)).start()

        # Pass the data to the SAM model using the AnnotationModule
        frame_idx, out_obj_ids, out_mask_logits = annotator.predict_mask(
            frame_idx=frame_idx,
            obj_id=object_id,
            points=points_np,
            labels=labels_np
        )

        print(frame_idx)
        print(out_obj_ids)
        print(out_mask_logits)

        # Ensure the outputs are not None
        if out_obj_ids is None or out_mask_logits is None:
            raise ValueError("Mask prediction failed: received None as output")

        binary_mask = (out_mask_logits > 0.0).cpu().numpy()
        # Modify the binary mask before returning it
        binary_mask = np.squeeze(binary_mask)  # This removes the extra dimension

        # Count values greater than 1 in out_mask_logits
        count_above_one = np.sum(out_mask_logits.cpu().numpy() > 1)
        print(f"Number of values in mask logits greater than 1: {count_above_one}")

        # Count how many pixels are predicted as part of the object (1 values in binary mask)
        count_true_pixels = np.sum(binary_mask == 1)
        print(f"Number of true (1) pixels in the binary mask: {count_true_pixels}")

        # Overlay the mask on the current frame
        #overlay_frame_path = annotator.display_frame_with_mask(frame_idx, out_obj_ids, out_mask_logits)

        # Return the overlay frame URL and mask prediction result
        return jsonify({
            'out_obj_ids': out_obj_ids,
            'frame_idx': frame_idx,
            'binary_mask': binary_mask.tolist()
        })

    except Exception as e:
        print(f"Error during mask prediction: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/predict_mask_from_mask', methods=['POST'])
def predict_mask_from_mask():
    try:
        # Get the data from the request
        data = request.json
        frame_idx = data.get('frame_idx')
        obj_id = data.get('obj_id')
        mask = data.get('mask')  # mask should be a list or array

        # Validate inputs
        if frame_idx is None or obj_id is None or mask is None:
            return jsonify({'error': 'Missing required parameters'}), 400

        # Convert the mask to a NumPy array
        mask_np = np.array(mask, dtype=np.uint8)

        # Pass the data to the predict_mask_from_mask function
        frame_idx, out_obj_ids, out_mask_logits = annotator.predict_mask_from_mask(
            frame_idx=frame_idx,
            obj_id=obj_id,
            mask=mask_np
        )

        # Return the result as JSON
        return jsonify({
            'frame_idx': frame_idx,
            'out_obj_ids': out_obj_ids,
            'out_mask_logits': out_mask_logits.tolist()  # Convert to list for JSON
        }), 200

    except Exception as e:
        print(f"Error in predict_mask_from_mask: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/propagate_masks', methods=['POST'])
def propagate_masks():
    try:
        # Start the mask propagation process
        video_segments = annotator.propagate_segmentation(annotator.inference_state)

        # Prepare the binary_mask_per_frame_list to return with frame_idx, obj_id, and binary_mask
        binary_mask_per_frame_list = []
        for obj_id, frame_masks in video_segments.items():
            for frame_idx, binary_mask in frame_masks.items():
                # Modify the binary mask before returning it
                binary_mask = np.squeeze(binary_mask)  # This removes the extra dimension
                # Add each mask with its frame and object ID, confirming the order
                binary_mask_per_frame_list.append({
                    'obj_id': obj_id,          # Include object ID
                    'frame_idx': frame_idx,    # Include frame index
                    'binary_mask': binary_mask.tolist()  # Convert numpy array to list for JSON
                })

        # Return the results as a JSON response
        return jsonify({
            'message': 'Mask propagation completed',
            'binary_mask_per_frame_list': binary_mask_per_frame_list
        }), 200

    except Exception as e:
        print(f"Error during mask propagation: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/video-info', methods=['GET'])
def get_video_info():
    video_height = annotator.inference_state.get('video_height')
    video_width = annotator.inference_state.get('video_width')
    
    if video_height and video_width:
        return jsonify({
            'video_height': video_height,
            'video_width': video_width
        }), 200
    else:
        return jsonify({'error': 'Video dimensions not available'}), 404
    
@app.route('/reset_inference', methods=['POST'])
def reset_inference():
    try:
        # Call the reset_inference_state function from the AnnotationModule
        annotator.reset_inference_state()
        
        # Return a success message
        return jsonify({
            'message': 'Inference state has been reset successfully.'
        }), 200
    except Exception as e:
        # Return an error message if resetting fails
        return jsonify({'error': f"Error resetting inference state: {str(e)}"}), 500
    
@app.route('/download_video', methods=['POST'])
def download_video():
    try:
        # Get the mask data from the request
        data = request.json
        masks_by_object_and_frame = data.get('masksByObjectAndFrame')

        if not masks_by_object_and_frame:
            return jsonify({'error': 'No mask data provided'}), 400

        # Call a function in AnnotationModule to generate the video with masks
        output_video_path = annotator.create_annotated_video(masks_by_object_and_frame)

        if os.path.exists(output_video_path):
            return send_from_directory(os.path.dirname(output_video_path), os.path.basename(output_video_path), as_attachment=True)
        else:
            return jsonify({'error': 'Video generation failed'}), 500

    except Exception as e:
        print(f"Error generating video: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Route to serve the overlay frame
@app.route('/overlay/<filename>')
def get_overlay_frame(filename):
    return send_from_directory(annotator.overlay_folder, filename)

# Run the Flask app
if __name__ == '__main__':
    app.run(debug=True, port=5000)
