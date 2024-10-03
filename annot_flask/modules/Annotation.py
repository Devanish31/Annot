import os
import cv2
import torch
import torchvision
import numpy as np
from PIL import Image
import base64
from sam2.build_sam import build_sam2_video_predictor
from IPython.display import display, Image

# select the device for computation
if torch.cuda.is_available():
    device = torch.device("cuda")
elif torch.backends.mps.is_available():
    device = torch.device("mps")
else:
    device = torch.device("cpu")
print(f"using device: {device}")

if device.type == "cuda":
    # use bfloat16 for the entire notebook
    torch.autocast("cuda", dtype=torch.bfloat16).__enter__()
    # turn on tfloat32 for Ampere GPUs (https://pytorch.org/docs/stable/notes/cuda.html#tensorfloat-32-tf32-on-ampere-devices)
    if torch.cuda.get_device_properties(0).major >= 8:
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
elif device.type == "mps":
    print(
        "\nSupport for MPS devices is preliminary. SAM 2 is trained with CUDA and might "
        "give numerically different outputs and sometimes degraded performance on MPS. "
        "See e.g. https://github.com/pytorch/pytorch/issues/84936 for a discussion."
    )

# Annotation module
class AnnotationModule:
    def __init__(self, model_cfg, checkpoint, device):
        """ 
        Initialize the annotation module with video processing and segmentation functionalities.
        """
        self.model_cfg = model_cfg
        self.checkpoint = checkpoint
        self.device = device
        self.predictor = build_sam2_video_predictor(model_cfg, checkpoint, device=device)
        self.frame_folder = None  # Folder where frames will be saved
        self.frame_names = None
        self.current_video_path = None
        self.inference_state = None
        self.prompts = {}
        # Define custom color list (RGB format, 0-255 range) as a class property
        self.custom_colors = {
            1: [0, 0, 255],     # blue (solid organ)
            2: [255, 0, 0],     # red (artery)
            3: [0, 0, 255],     # blue (vein)
            4: [255, 255, 0],   # yellow (nerve)
            5: [128, 0, 128],   # purple (bone)
            6: [0, 255, 0],     # green (muscle)
            7: [255, 165, 0],   # orange (instrument)
            8: [128, 128, 0],   # olive green (LN)
            9: [128, 128, 128]  # grey (other)
        }

    def build_sam2_video_predictor(self, model_cfg, checkpoint, device):
        """ 
        Placeholder function to initialize SAM2 video predictor.
        """
        # Assuming this is a placeholder for the actual SAM2 video segmentation model
        return self.predictor(model_cfg, checkpoint, device)

    def video_to_frames(self, file):
        """
        Processes the video, saves frames as images, stores the directory for future segmentation tasks,
        and loads the frame names internally.
        
        Args:
            file (str): The path to the video file (e.g., .mp4).
        
        Returns:
            frame_folder (str): The folder where the frames are saved.
        """
        video_dir = os.path.dirname(file)
        video_name = os.path.splitext(os.path.basename(file))[0]

        self.frame_folder = os.path.join(video_dir, video_name)

        if not os.path.exists(self.frame_folder):
            os.makedirs(self.frame_folder)

        cap = cv2.VideoCapture(file)

        if not cap.isOpened():
            print(f"Error: Could not open video file {file}")
            return None

        frame_count = 0
        success, frame = cap.read()

        while success:
            frame_filename = os.path.join(self.frame_folder, f"{frame_count:05d}.jpg")
            cv2.imwrite(frame_filename, frame)
            success, frame = cap.read()
            frame_count += 1

        cap.release()
        print(f"Processed {frame_count} frames from the video")

        # Load and sort the frame names internally for future use
        self.frame_names = [
            p for p in os.listdir(self.frame_folder)
            if os.path.splitext(p)[-1].lower() in [".jpg", ".jpeg"]
        ]
        self.frame_names.sort(key=lambda p: int(os.path.splitext(p)[0]))

        # Only return the frame folder
        return self.frame_folder

    def init_inference_state(self, frame_folder):
        """
        Initialize the inference state for segmentation with a new video frame folder.
        Parameters:
            - frame_folder (str): Path to the video frames folder.
        """
        try:
            print("Initializing the inference state...")
            self.inference_state = self.predictor.init_state(video_path=frame_folder)
            self.current_video_path = frame_folder
            print("Inference state initialized successfully.")
            return self.inference_state
        except Exception as e:
            print(f"Error initializing inference state: {e}")
            raise  # Re-raise the exception after logging for debugging purposes

    def reset_inference_state(self):
        """
        Reset the current inference state.
        This function assumes that the state was initialized already and just resets it.
        """
        try:
            if self.inference_state is not None:
                print("Resetting the inference state...")
                self.predictor.reset_state(self.inference_state)
                print("Inference state reset successfully.")
                #return self.inference_state
            else:
                raise ValueError("Inference state has not been initialized.")
        except Exception as e:
            print(f"Error resetting inference state: {e}")
            raise  # Re-raise the exception after logging for debugging purposes

    def predict_mask(self, frame_idx, obj_id, points, labels):
        """
        Add click prompts for segmentation at a specific frame and object ID.
        """
        points = np.array(points, dtype=np.float32)
        labels = np.array(labels, np.int32)

        self.prompts[obj_id] = (points, labels)

        frame_idx, out_obj_ids, out_mask_logits = self.predictor.add_new_points_or_box(
            inference_state=self.inference_state,
            frame_idx=frame_idx,
            obj_id=obj_id,
            points=points,
            labels=labels,
        )

        if out_obj_ids is None or out_mask_logits is None:
            raise ValueError(f"add_new_points_or_box returned None for frame_idx={frame_idx}, obj_id={obj_id}")
        return frame_idx, out_obj_ids, out_mask_logits

    def display_frame_with_mask(self, frame_idx, out_obj_ids, out_mask_logits, save_path=None):
        """
        Display a specified frame with the segmentation results, overlay the mask using OpenCV, 
        and return the result as a JPEG for display in the React app.
        
        Args:
            frame_idx (int): The index of the frame to display.
            out_obj_ids (list): List of object IDs predicted by SAM.
            out_mask_logits (list): List of mask logits from SAM.
            save_path (str): Optional. If provided, the frame will be saved at this path instead of returned.
            
        Returns:
            str: Path to the saved image or None if no save_path is provided.
        """
    
        # Load the current frame
        frame_path = os.path.join(self.frame_folder, self.frame_names[frame_idx])
        frame = cv2.imread(frame_path)
    
        if frame is None:
            raise ValueError(f"Frame not found at path: {frame_path}")
    
        # Iterate over each object ID and display the masks
        for i, out_obj_id in enumerate(out_obj_ids):
            # Get mask, threshold it, and convert it to a 3-channel image
            mask = (out_mask_logits[i] > 0.0).cpu().numpy().astype(np.uint8) * 255
            h, w = mask.shape[-2:]
            mask = mask.reshape(h, w, 1)
    
            # Get the color for the current object ID
            color = np.array(self.custom_colors.get(out_obj_id, [128, 128, 128]))  # Default to grey if obj_id not in list
            color = color.reshape(1, 1, 3)  # Reshape for broadcasting
    
            # Create the mask image with the color applied (3-channel RGB mask)
            mask_image = mask * color

            # Ensure that mask_image stays within the range and type of uint8
            mask_image = np.clip(mask_image, 0, 255).astype(np.uint8)
    
            # Overlay the mask on the frame with some transparency
            frame = cv2.addWeighted(frame, 0.7, mask_image, 0.3, 0)
    
        # Save or return the frame with overlaid mask
        if save_path:
            cv2.imwrite(save_path, frame)
            return save_path
        else:
            # Convert to JPEG bytes to return for React frontend
            _, buffer = cv2.imencode('.jpg', frame)
            # Encode the JPEG buffer to base64
            #base64_image = base64.b64encode(buffer).decode('utf-8')
            # Now you can return this base64 string in your response
            #return f"data:image/jpeg;base64,{base64_image}"
            ## Convert the JPEG byte buffer to an image for display in the notebook
            #display(Image(data=buffer.tobytes()))
            return buffer.tobytes()
        
    def predict_mask_from_mask(self, frame_idx, obj_id, mask):
        """
        Add a segmentation mask for a specific frame and object ID.
        
        Args:
            frame_idx (int): The index of the frame where the mask should be added.
            obj_id (int): The object ID to associate with the mask.
            mask (np.array): The mask to apply for the object.
        
        Returns:
            tuple: (frame_idx, out_obj_ids, out_mask_logits) after applying the mask.
        """
        # Ensure mask is a NumPy array and has the correct shape
        mask = np.array(mask, dtype=np.uint8)

        # Add the mask to the SAM2 model for the given object and frame
        frame_idx, out_obj_ids, out_mask_logits = self.predictor.add_new_mask(
            inference_state=self.inference_state,
            frame_idx=frame_idx,
            obj_id=obj_id,
            mask=mask
        )

        if out_obj_ids is None or out_mask_logits is None:
            raise ValueError(f"add_new_mask returned None for frame_idx={frame_idx}, obj_id={obj_id}")

        # Return the frame index, object IDs, and the logits for the generated mask
        return frame_idx, out_obj_ids, out_mask_logits


    def propagate_segmentation(self, inference_state):
        """
        Propagate the segmentation through the entire video and collect results.
        """
        video_segments = {}
    
        for out_frame_idx, out_obj_ids, out_mask_logits in self.predictor.propagate_in_video(inference_state):
            for i, out_obj_id in enumerate(out_obj_ids):
                # Initialize a dictionary for the object ID if not already present
                if out_obj_id not in video_segments:
                    video_segments[out_obj_id] = {}
                    
                # Store the mask for the current frame under the corresponding object ID
                video_segments[out_obj_id][out_frame_idx] = (out_mask_logits[i] > 0.0).cpu().numpy()
        
        return video_segments

    def display_propagated_masks(self, vis_frame_stride=30, extract_as_video="no", output_video_path="masked_output.mp4"):
        """
        Display the propagated segmentation masks on frames at regular intervals and optionally save them as a video.
        
        Args:
            vis_frame_stride (int): How frequently to visualize frames. For example, every 30 frames.
            extract_as_video (str): If set to 'yes', save the masked frames as a video.
            output_video_path (str): Path where the output video will be saved (only used if extract_as_video is 'yes').
            
        Returns:
            List of byte buffers for each frame, if extract_as_video is not enabled.
        """
        if self.inference_state is None:
            print("Inference state is not initialized. Cannot display or extract propagated masks.")
            return
    
        # Run propagation through the video and collect the segmentation results
        video_segments = self.propagate_segmentation(self.inference_state)
    
        frame_buffers = []  # List to hold byte buffers for each frame if not saving video
    
        # Initialize video writer if extracting as video
        if extract_as_video == "yes":
            # Get the size of the original frames (expected frame size)
            frame_sample = cv2.imread(os.path.join(self.frame_folder, self.frame_names[0]))
            if frame_sample is None:
                raise ValueError("Cannot load sample frame for size reference.")
            frame_height, frame_width, _ = frame_sample.shape
    
            # Initialize video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # Use 'mp4v' codec
            video_writer = cv2.VideoWriter(output_video_path, fourcc, 20.0, (frame_width, frame_height))
    
        # Loop through the frames with the specified stride and process
        for out_frame_idx in range(0, len(self.frame_names), vis_frame_stride):
            # Load the frame
            frame_path = os.path.join(self.frame_folder, self.frame_names[out_frame_idx])
            frame = cv2.imread(frame_path)
    
            if frame is None:
                raise ValueError(f"Frame not found at path: {frame_path}")
    
            # For each object ID in the frame, overlay the corresponding mask
            if out_frame_idx in video_segments:
                for out_obj_id, out_mask in video_segments[out_frame_idx].items():

                    # Get the color for the current object ID
                    color = np.array(self.custom_colors.get(out_obj_id, [128, 128, 128]))  # Default to grey if obj_id not in list
                    color = color.reshape(1, 1, 3)  # Reshape for broadcasting
    
                    # Create the mask image with the color applied (3-channel RGB mask)
                    mask = out_mask.astype(np.uint8) * 255
                    h, w = mask.shape[-2:]
                    mask = mask.reshape(h, w, 1)
                    mask_image = mask * color
    
                    # Ensure that mask_image stays within the range and type of uint8
                    mask_image = np.clip(mask_image, 0, 255).astype(np.uint8)
    
                    # Overlay the mask on the frame with some transparency
                    frame = cv2.addWeighted(frame, 0.7, mask_image, 0.3, 0)
    
            # Save or display the masked frame
            if extract_as_video == "yes":
                # Write the frame with mask to the video
                video_writer.write(frame)
            else:
                # Convert the frame to a byte buffer for returning to frontend (React)
                _, buffer = cv2.imencode('.jpg', frame)
                frame_buffers.append(buffer.tobytes())
    
        # Release the video writer if extracting as video
        if extract_as_video == "yes":
            video_writer.release()
            print(f"Video saved at {output_video_path}")
    
        # Return list of byte buffers if not saving video
        if extract_as_video != "yes":
            return frame_buffers
        
    def create_annotated_video(self, masks_by_object_and_frame):
        """
        Generate a video by overlaying masks on all frames and combining them.
        
        Args:
            masks_by_object_and_frame (dict): Contains mask data for each object and frame.
        
        Returns:
            output_video_path (str): Path to the generated video file.
        """
        try:
            frame_paths = [os.path.join(self.frame_folder, frame) for frame in sorted(os.listdir(self.frame_folder))]
            print(f"Length of frames: {len(frame_paths)}")

            if not frame_paths:
                raise ValueError("No frames found for creating video")

            # Set up video writer
            frame_sample = cv2.imread(frame_paths[0])
            height, width, _ = frame_sample.shape
            print(f"Height: {height}, Width: {width}")
            output_video_path = os.path.join(self.frame_folder, "annotated_video.mp4")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            video_writer = cv2.VideoWriter(output_video_path, fourcc, 30.0, (width, height))

            # Loop through all frames and overlay masks
            for frame_idx, frame_path in enumerate(frame_paths):
                print(f"Processing frame {frame_idx + 1} / {len(frame_paths)}: {frame_path}")                
                frame = cv2.imread(frame_path)

                if frame is None:
                    print(f"Error: Could not read frame at path: {frame_path}")
                    continue

                # Debugging info: Check the frame dimensions
                print(f"Frame dimensions: {frame.shape}")

                # Initialize a flag to check if any mask was applied to the frame
                mask_applied = False

                # Overlay the mask for each object if it exists
                for obj_id, frames in masks_by_object_and_frame.items():
                    # Convert obj_id to integer
                    obj_id = int(obj_id)  # Ensure obj_id is an integer
                    print(f"Checking for mask for object {obj_id} on frame {frame_idx}")
                    print(f"Object ID: {obj_id}, Type: {type(obj_id)}")
                    if str(frame_idx) in frames:
                        print(f"Mask found for object {obj_id} on frame {frame_idx}")
                        mask = np.array(frames[str(frame_idx)], dtype=np.uint8) * 255

                        # Retrieve the color for the current object from customColors
                        color = np.array(self.custom_colors.get(obj_id, [128, 128, 128]), dtype=np.uint8)
                        print(f"Applying color {color} for object {obj_id}")
                        color = color.reshape(1, 1, 3)  # Reshape for broadcasting

                        # Create a 3-channel mask using the object-specific color
                        mask_rgb = mask[:, :, np.newaxis] * color

                        # Overlay the mask on the frame with some transparency
                        frame = cv2.addWeighted(frame, 0.7, mask_rgb, 0.3, 0)
                        mask_applied = True

                    else:
                        print(f"No mask found for object {obj_id} on frame {frame_idx}")

                if not mask_applied:
                    print(f"No mask applied on frame {frame_idx}")

                video_writer.write(frame)

            video_writer.release()
            print(f"Annotated video saved at {output_video_path}")
            return output_video_path

        except Exception as e:
            print(f"Error creating annotated video: {str(e)}")
            raise