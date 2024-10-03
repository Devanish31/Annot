import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import ObjectsContainer from './components/objectscontainer';
import ToolsContainer from './components/tools';
import FrameViewer from './components/frameviewer';
import './light-mode.css'; // Import the global styles once
import './night-mode.css'; // Import the global styles once

export default function App() {
  const [frames, setFrames] = useState([]); // Array of frame URLs
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0); // Current frame index
  const [selectedObjectId, setSelectedObjectId] = useState(null); // Selected object ID
  const [masksByObjectAndFrame, setMasksByObjectAndFrame] = useState({});
  const [pointsByObjectAndFrame, setPointsByObjectAndFrame] = useState({}); // Object to store points by frame
  const resetFrameViewer = useRef(null); // To hold the reset handler for FrameViewer
  const [editedMasksByObjectAndFrame, setEditedMasksByObjectAndFrame] = useState({}); // To store edited masks
  const [maskModeEdit, setMaskModeEdit] = useState(false); // Toggle between predicted and edit mode
  const canvasRef = useRef(null); // Ref for mask canvas
  const [showMask, setShowMask] = useState(true);  // New state to control whether to display masks
  const editedCanvasRef = useRef(null); // Ref for the edited mask
  const circleCanvasRef = useRef(null); // New canvas ref for the circle cursor
  const [maskUndoStack, setMaskUndoStack] = useState([]); // Undo stack for masks
  const [maskRedoStack, setMaskRedoStack] = useState([]); // Redo stack for masks
  const [isNightMode, setIsNightMode] = useState(false); // State to manage light and night mode
  
  

  // Calculate current frame points based on the selected object and current frame
  const currentFramePoints = pointsByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || [];

  const toggleMaskEditMode = (isEditMode) => {
  setMaskModeEdit(isEditMode); // Set mask mode explicitly to the passed value
  };

  // Define your custom colors based on object IDs
  const customColors = {
    1: [0, 0, 255],   // brown (solid organ)
    2: [255, 0, 0],   // red (artery)
    3: [0, 0, 255],   // blue (vein)
    4: [255, 255, 0],   // yellow (nerve)
    5: [128, 0, 128],   // purple (bone)
    6: [0, 255, 0],   // green (muscle)
    7: [255, 165, 0],   // orange (instrument)
    8: [128, 128, 0],   // olive green (LN)
    9: [128, 128, 128], // grey (other)
  };

  
  // Toggle between light and night mode
  const toggleCSSMode = () => {
    setIsNightMode(!isNightMode);
  };

  // Use useEffect to dynamically switch CSS files based on the mode
  useEffect(() => {
    const themeLink = document.getElementById('theme-style');
    themeLink.href = isNightMode ? '/night-mode.css' : '/light-mode.css';
  }, [isNightMode]);

  useEffect(() => {
    console.log(`Mask edit mode is now: ${maskModeEdit ? 'Enabled' : 'Disabled'}`);
  }, [maskModeEdit]); // This will log whenever maskModeEdit changes

  useEffect(() => {
    console.log("Current editedMasksByObjectAndFrame after predict/propagate/reset:", editedMasksByObjectAndFrame);
  }, [editedMasksByObjectAndFrame]);

  const overlayBinaryMask = (ctx, mask, currentSelectedObjId, canvasWidth, canvasHeight) => {
    
    console.log('Overlaying binary mask for object:', currentSelectedObjId);
    console.log('Mask data:', mask);

    if (!mask) {
        console.error('No valid mask to overlay.');
        return;
    }

    // Use currentSelectedObjId for determining the color
    const color = customColors[currentSelectedObjId] || [128, 128, 128]; // Default to grey if object ID not found
    console.log('Using color:', color, 'for object ID:', currentSelectedObjId);

    // Get the dynamic mask dimensions
    const maskWidth = mask[0].length;  // Width of the mask (number of columns)
    const maskHeight = mask.length;    // Height of the mask (number of rows)

    // Calculate scaling factors between mask dimensions and canvas dimensions
    const scaleX = canvasWidth / maskWidth;
    const scaleY = canvasHeight / maskHeight;

    // Initialize a counter for the number of "1"s in the mask
    let truePixelCount = 0;

    // Overlay the mask on the canvas using the color for the selected object
    mask.forEach((row, y) => {
        row.forEach((pixel, x) => {
            if (pixel === true) {  // Only draw where pixel value is 1 (indicating the object)
                truePixelCount++; // Increment the counter for every "true" pixel
                ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`; // Adjust transparency
                // Scale the x and y coordinates to match the canvas size
                const scaledX = x * scaleX;
                const scaledY = y * scaleY;
                ctx.fillRect(scaledX, scaledY, scaleX, scaleY); // Draw pixel at the correct location
            }
        });
    });

    // Log the total count of "1" pixels in the mask
    console.log(`Total true (1) pixels in mask: ${truePixelCount}`);

    console.log('Mask overlay completed.');
  };

  const displayPredictedMask = () => {
    const frameImageElement = document.getElementById(`frameImage-${currentFrameIndex}`);
    
    if (canvasRef.current && frameImageElement) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Clear the canvas before drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Set the canvas size to match the dimensions of the displayed frame image
        canvas.width = frameImageElement.width;
        canvas.height = frameImageElement.height;

        // Check if the current mask (predicted) exists
        const currentMask = masksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];
        
        if (currentMask) {
            console.log(`Displaying predicted mask for object ${selectedObjectId}, frame ${currentFrameIndex}`);
            // Display the predicted mask
            overlayBinaryMask(ctx, currentMask, selectedObjectId, canvas.width, canvas.height);
        } else {
            console.log(`No predicted mask available for object ${selectedObjectId}, frame ${currentFrameIndex}`);
        }
    } else {
        console.log(`Canvas or frame image not found for frame ${currentFrameIndex}. Cannot display predicted mask.`);
    }
  };

  const displayEditedMask = () => {
      const frameImageElement = document.getElementById(`frameImage-${currentFrameIndex}`);
      
      if (editedCanvasRef.current && frameImageElement) {
          const canvas = editedCanvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // Clear the canvas before drawing
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Set the canvas size to match the dimensions of the displayed frame image
          canvas.width = frameImageElement.width;
          canvas.height = frameImageElement.height;

          // Fetch the edited mask for the current frame and object
          const currentEditedMask = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];

          if (currentEditedMask) {
              console.log(`Displaying edited mask for object ${selectedObjectId}, frame ${currentFrameIndex}`);
              // Display the edited mask
              overlayBinaryMask(ctx, currentEditedMask, selectedObjectId, canvas.width, canvas.height);
          } else {
              console.log(`No edited mask available for object ${selectedObjectId}, frame ${currentFrameIndex}`);
          }
      } else {
          console.log(`Canvas or frame image not found for frame ${currentFrameIndex}. Cannot display edited mask.`);
      }
  };

  // Unified useEffect to control mask display based on `maskModeEdit`
  useEffect(() => {
    // Clear both canvases if masks should not be shown
    if (!showMask) {
        // Clear predicted mask canvas
        const predictedCanvas = canvasRef.current;
        if (predictedCanvas) {
            const predictedCtx = predictedCanvas.getContext('2d');
            predictedCtx.clearRect(0, 0, predictedCanvas.width, predictedCanvas.height);  // Clear the predicted canvas
        }

        // Clear edited mask canvas
        const editedCanvas = editedCanvasRef.current;
        if (editedCanvas) {
            const editedCtx = editedCanvas.getContext('2d');
            editedCtx.clearRect(0, 0, editedCanvas.width, editedCanvas.height);  // Clear the edited canvas
        }

        console.log('Masks removed, not displaying any mask.');
        return;  // Exit early since no mask should be shown
    }

    // Logic for displaying masks based on maskModeEdit
    if (maskModeEdit) {
        // Display the edited mask on the edited canvas
        displayEditedMask();
    } else {
        // Display the predicted mask on the predicted canvas
        displayPredictedMask();
    }
  }, [maskModeEdit, selectedObjectId, currentFrameIndex, showMask, masksByObjectAndFrame, editedMasksByObjectAndFrame]);  // Add showMask as a dependency

  // Handle object selection from ObjectsContainer
  const handleObjectSelect = (newObjectId) => {
    // Check if points exist for the currently selected object in any frame
    const currentObjectPoints = pointsByObjectAndFrame[selectedObjectId] || {};
    const pointsExistForAnyFrame = Object.values(currentObjectPoints).some((points) => points.length > 0);

    // Check if masks exist for the currently selected object in any frame
    const currentObjectMasks = masksByObjectAndFrame[selectedObjectId] || {};
    const masksExistForAnyFrame = Object.values(currentObjectMasks).some((mask) => mask && mask.length > 0);

    // Prevent object change and provide separate messages for points and masks
    if (pointsExistForAnyFrame) {
        alert('Please remove all points for the current object before changing to another object.');
        return;
    }

    if (masksExistForAnyFrame) {
        alert('Cannot move to another object while a mask is available. Please reset the inference state.');
        return;
    }

    // If no points or masks exist, allow switching to the new object
    setSelectedObjectId(newObjectId);
  };




  // Handle video upload and frame extraction
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('video', file);

    try {
      const response = await fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      console.log('Upload Response:', data);

      if (response.ok && data.frames) {
        console.log('Video upload successful:', data); // Log the entire response data
        setFrames(data.frames); // Set frame URLs
        setCurrentFrameIndex(0); // Reset to first frame
        setPointsByObjectAndFrame({}); // Reset points when a new video is uploaded
      } else {
        alert(data.error || 'Error uploading video');
      }
    } catch (error) {
      console.error('Upload Error:', error);
    }
  };

  // Handle frame navigation
  const handleFrameChange = (index) => {
    if (index >= 0 && index < frames.length && index !== currentFrameIndex) {
        setCurrentFrameIndex(index);
    }
  };

  // Handle predict button click
  const handlePredictClick = async () => {
    if (!selectedObjectId || !frames[currentFrameIndex] || currentFramePoints.length === 0) {
        alert("Please select an object and frame first.");
        return;
    }

    try {
        const response = await fetch('http://127.0.0.1:5000/predict_mask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                object_id: selectedObjectId,
                frame_idx: currentFrameIndex,
                points: currentFramePoints.map(p => ({ x: p.scaledX, y: p.scaledY, label: p.label })),
            }),
        });

        const data = await response.json();
        if (response.ok) {
            if (data.binary_mask && data.binary_mask.length > 0) {
              console.log("Received binary mask data:", data.binary_mask);  // Log raw data  
              // Log the shape of the mask
              const maskHeight = data.binary_mask.length;
              const maskWidth = data.binary_mask[0].length;
              console.log(`Mask shape: (${maskHeight}, ${maskWidth})`);

              // Count the number of true (1) pixels in the binary mask
              let truePixelCount = 0;
              data.binary_mask.forEach(row => {
                  truePixelCount += row.filter(pixel => pixel === true).length;
              });
              console.log(`Number of true (1) pixels in the binary mask: ${truePixelCount}`);
            }
            // Add the predicted mask to the mask list
            setMasksByObjectAndFrame(prevMasks => ({
                ...prevMasks,
                [selectedObjectId]: {
                    ...prevMasks[selectedObjectId],
                    [currentFrameIndex]: data.binary_mask,
                }
            }));

            setEditedMasksByObjectAndFrame(prevEditedMasks => ({
              ...prevEditedMasks,
              [selectedObjectId]: {
                ...prevEditedMasks[selectedObjectId],
                [currentFrameIndex]: JSON.parse(JSON.stringify(data.binary_mask)),  // Deep copy
              }
            }));
            console.log("Mask prediction, adding to predicted and edited masks - Successful:", data);
        } else {
            console.error("Error predicting mask:", data.error);
            alert(`Mask Prediction Error: ${data.error}`);
        }
    } catch (error) {
        console.error("Error predicting mask:", error);
        alert("An error occurred while predicting the mask.");
    }
  };

  // Add this function to handle the "Mask Input" button click
  const handleMaskInputClick = async () => {
    if (!selectedObjectId || !frames[currentFrameIndex]) {
      alert("Please select an object and frame first.");
      return;
    }

    // Check if the current edited mask exists for the selected object and current frame
    const currentEditedMask = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];
    if (!currentEditedMask || currentEditedMask.length === 0) {
      alert("Please ensure there is an edited mask for the current object and frame before submitting the mask.");
      return;
    }

    console.log("Submitting mask input for object:", selectedObjectId, "frame:", currentFrameIndex);
    // Log the data being sent to the backend before the request
    const dataToSubmit = {
      obj_id: selectedObjectId,
      frame_idx: currentFrameIndex,
      mask: currentEditedMask,  // Use the current edited mask
    };
  
    console.log("Data being submitted:", dataToSubmit);

    try {
      // Send the edited mask to the backend
      const response = await fetch('http://127.0.0.1:5000/predict_mask_from_mask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSubmit),
      });

      // Log the raw response object to see all response properties
      console.log("Raw response:", response);

      // Parse the response data
      const data = await response.json();

      // Log the parsed response data
      console.log("Response data received:", data);

      if (response.ok) {
        console.log("Mask input successfully submitted:", data);
        alert("Mask input successfully submitted.");
      } else {
        console.error("Error submitting mask input:", data.error);
        alert(`Mask Input Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error submitting mask input:", error);
      alert("An error occurred while submitting the mask input.");
    }
  };

  const handlePropagateClick = async () => {
    if (!selectedObjectId || !frames[currentFrameIndex]) {
        alert("Please select an object and frame first.");
        return;
    }

    // Check if a predicted mask exists for the selected object and current frame
    const existingMask = masksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];
    if (!existingMask || existingMask.length === 0) {
        alert("Please ensure a predicted mask exists for the current object and frame before propagating.");
        return;
    }

    console.log("Starting mask propagation for object:", selectedObjectId);

    try {
        const response = await fetch('http://127.0.0.1:5000/propagate_masks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                object_id: selectedObjectId,
                frame_idx: currentFrameIndex,
                binary_mask: existingMask,  // Use the existing predicted mask
            }),
        });

        const data = await response.json();

        if (response.ok) {
            console.log("Propagation request successful, processing mask results...");
            
            const { binary_mask_per_frame_list } = data;  // Extract the list of masks
            
            // Log total frames received for masks propagation
            console.log(`Received masks for ${binary_mask_per_frame_list.length} frames.`);

            // Update the masksByObjectAndFrame state for each object and frame
            setMasksByObjectAndFrame((prevMasks) => {
                const updatedMasks = { ...prevMasks };
                binary_mask_per_frame_list.forEach(({ obj_id, frame_idx, binary_mask }) => {
                    if (binary_mask && binary_mask.length > 0) {
                        // Log the shape of each propagated mask
                        const maskHeight = binary_mask.length;
                        const maskWidth = binary_mask[0].length;
                        console.log(`Mask shape for object ${obj_id}, frame ${frame_idx}: (${maskHeight}, ${maskWidth})`);
                    }
                    updatedMasks[obj_id] = {
                        ...updatedMasks[obj_id],
                        [frame_idx]: binary_mask,  // Add the binary mask for the specific object and frame
                    };
                });
                return updatedMasks;
            });
          
            // Update editedMasksByObjectAndFrame with the same propagated masks (deep copy)
            setEditedMasksByObjectAndFrame((prevEditedMasks) => {
              const updatedEditedMasks = { ...prevEditedMasks };
              binary_mask_per_frame_list.forEach(({ obj_id, frame_idx, binary_mask }) => {
                if (binary_mask && binary_mask.length > 0) {
                  updatedEditedMasks[obj_id] = {
                    ...updatedEditedMasks[obj_id],
                    [frame_idx]: JSON.parse(JSON.stringify(binary_mask)), // Deep copy to prevent unwanted sync
                  };
                }
              });
              return updatedEditedMasks;
            });

            console.log("Mask propagation and syncing to edited masks successful:", data);
                  
        } else {
            console.error("Error propagating mask:", data.error);
            alert(`Mask Propagation Error: ${data.error}`);
        }
    } catch (error) {
        console.error("Error propagating mask:", error);
        alert("An error occurred while propagating the mask.");
    }
  };


  useEffect(() => {
    console.log("Current masksByObjectAndFrame after predict/propagate/reset:", masksByObjectAndFrame);
  }, [masksByObjectAndFrame]);

  const handleResetState = async () => {
    try {
      // Call the Flask API to reset the inference state
      const response = await fetch('http://127.0.0.1:5000/reset_inference', {
        method: 'POST',
      });

      if (response.ok) {
        console.log("Inference state reset on the server");

        // Clear states in App.jsx
        setSelectedObjectId(null);
        setMasksByObjectAndFrame({});
        setPointsByObjectAndFrame({});
        
        // Call the reset function for FrameViewer
        if (resetFrameViewer.current) {
          resetFrameViewer.current();
        }

        alert("State reset successfully!");
      } else {
        const data = await response.json();
        console.error("Error resetting inference state:", data.error);
        alert(`Reset Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error during reset:", error);
      alert("An error occurred while resetting the state.");
    }
  };

  const handleConfirmFrame = () => {
    const canvas = editedCanvasRef.current; // Use the editedCanvasRef for confirmed masks
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const frameImageElement = document.getElementById(`frameImage-${currentFrameIndex}`);

    if (!canvas || !frameImageElement) {
        console.error('Canvas or frame image not found.');
        return;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Get the original mask size (from the edited mask or original mask)
    const maskWidth = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex]?.[0]?.length || canvasWidth;
    const maskHeight = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex]?.length || canvasHeight;

    const scaleX = maskWidth / canvasWidth;
    const scaleY = maskHeight / canvasHeight;

    // Get the existing mask for this frame and object, or initialize it as `false`
    const existingMask = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || Array.from({ length: maskHeight }, () => Array(maskWidth).fill(false));

    // Loop through every pixel on the canvas
    for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
            const pixelData = ctx.getImageData(x, y, 1, 1).data; // Get RGBA values of the pixel

            // Define the color to detect based on the object (e.g., artery = red)
            const colorToDetect = customColors[selectedObjectId] || [128, 128, 128]; // Default to grey if no color

            // Check if this pixel matches the object color (you might need a tolerance range)
            if (
                Math.abs(pixelData[0] - colorToDetect[0]) < 10 &&
                Math.abs(pixelData[1] - colorToDetect[1]) < 10 &&
                Math.abs(pixelData[2] - colorToDetect[2]) < 10
            ) {
                // Scale x and y coordinates back to the mask size
                const maskX = Math.floor(x * scaleX);
                const maskY = Math.floor(y * scaleY);

                // Set the corresponding mask pixel to `true`, keeping existing `true` values intact
                existingMask[maskY][maskX] = true;
            }
        }
    }

    // Save the current mask state to the undo stack
    setMaskUndoStack((prevStack) => [
      ...prevStack,
      JSON.parse(JSON.stringify(editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex])),
    ]);
    setMaskRedoStack([]);  // Clear redo stack after new mask change

    // Update the edited mask state by merging with the existing mask
    setEditedMasksByObjectAndFrame((prevMasks) => ({
        ...prevMasks,
        [selectedObjectId]: {
            ...prevMasks[selectedObjectId],
            [currentFrameIndex]: existingMask,  // Use the updated mask that keeps the previous values
        },
    }));

    console.log('Updated mask for frame:', currentFrameIndex, 'with new mask data.');
  };

  const downloadVideo = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/download_video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          masksByObjectAndFrame, // Send masks data to backend
        }),
      });
  
      if (response.ok) {
        const videoBlob = await response.blob();
        const url = window.URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotated_video.mp4';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        console.error('Failed to download video:', response.statusText);
        alert('Failed to download video');
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      alert('Error occurred while downloading the video');
    }
  };
  

  
  return (
    <div className="app-container">
      <div className="main-container">
        
        {/* Left Objects Container */}
        <div className="left-side-container">
          
          {/* Objects at the top left */}
          <div className="objects-container">
            <ObjectsContainer 
              selectedObjectId={selectedObjectId}  // Pass selectedObjectId to sync with ObjectsContainer
              onObjectSelect={handleObjectSelect}
              isObjectChangeAllowed={() => {
                // Check if there are points for the currently selected object
                const currentObjectPoints = pointsByObjectAndFrame[selectedObjectId] || {};
                const currentObjectMasks = masksByObjectAndFrame[selectedObjectId] || {};
                
                // Allow object change only if no points or masks are present for the selected object
                return !Object.values(currentObjectPoints).some((points) => points.length > 0) &&
                       !Object.values(currentObjectMasks).some((mask) => mask && mask.length > 0);
              }}
              frames={frames}  // Pass frames array to check if frames exist
              onReset={(resetCallback) => resetFrameViewer.current = resetCallback} // Ensure correct passing of reset
          />
          </div>

          {/* Tools below the objects */}
          <div className="tools-container">
          <ToolsContainer 
            masksByObjectAndFrame={masksByObjectAndFrame}
            editedMasksByObjectAndFrame={editedMasksByObjectAndFrame}
            setEditedMasksByObjectAndFrame={setEditedMasksByObjectAndFrame}
            selectedObjectId={selectedObjectId}
            currentFrameIndex={currentFrameIndex}
            toggleMaskEditMode={toggleMaskEditMode} // Function to toggle mask editing
            maskModeEdit={maskModeEdit} // Boolean to track mask edit mode
            overlayBinaryMask={overlayBinaryMask}  // Pass the overlayBinaryMask function
            displayEditedMask={displayEditedMask} // Pass displayEditedMask
            editedCanvasRef={editedCanvasRef} // Pass the edited canvas ref for editing mask
            circleCanvasRef={circleCanvasRef}
            maskUndoStack={maskUndoStack}
            maskRedoStack={maskRedoStack}
            setMaskUndoStack={setMaskUndoStack}
            setMaskRedoStack={setMaskRedoStack}

          />
          </div>
          {/* Toggle Button for Light/Night Mode */}
          <div className="toggle-container">
            <button className="toggle-button" onClick={toggleCSSMode}>
              {isNightMode ? 'Switch to Light Mode' : 'Switch to Night Mode'}
            </button>
          </div>
        </div>

        {/* Right Side: Frame Viewer */}
        <div className="frame-nav-container">
          <FrameViewer
            frames={frames}
            currentFrameIndex={currentFrameIndex}
            selectedObjectId={selectedObjectId}
            onUpload={handleUpload}
            onFrameChange={handleFrameChange}
            pointsByObjectAndFrame={pointsByObjectAndFrame}
            setPointsByObjectAndFrame={setPointsByObjectAndFrame}
            masksByObjectAndFrame={masksByObjectAndFrame}  // Pass mask data to FrameViewer
            onReset={(resetCallback) => (resetFrameViewer.current = resetCallback)} // Pass the reset callback
            maskModeEdit={maskModeEdit} // Pass mask edit mode
            canvasRef={canvasRef} // Pass canvas ref to FrameViewer
            overlayBinaryMask={overlayBinaryMask}  // Pass the overlayBinaryMask function
            displayPredictedMask={displayPredictedMask} // Pass displayPredictedMask
            editedCanvasRef={editedCanvasRef} // Pass the edited canvas ref for editing mask
            circleCanvasRef={circleCanvasRef}
          />

          {/* Navigation Buttons */}
          {frames.length > 0 && (
            <div className="navigation-container">
              <button
                onClick={() => handleFrameChange(currentFrameIndex - 1)}
                disabled={currentFrameIndex === 0}
                className="arrow-button left"
              >
                &#8592; {/* Left Arrow */}
              </button>
              <input 
                type="range"
                min="0"
                max={frames.length - 1}
                value={currentFrameIndex}
                onChange={(e) => handleFrameChange(parseInt(e.target.value, 10))}
                className="slider"
              />
              <button
                onClick={() => handleFrameChange(currentFrameIndex + 1)}
                disabled={currentFrameIndex === frames.length - 1}
                className="arrow-button right"
              >
                &#8594; {/* Right Arrow */}
              </button>
            </div>  
          )}
            {/* Buttons below the slider */}
            <div className="button-container">
              <button className="action-button" onClick={handlePredictClick}>Predict Mask</button>
              <button
                className="action-button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to submit the mask input? This will send the current edited mask for the selected frame.")) {
                    handleMaskInputClick();
                  }
                }}
              >
                Mask Input
              </button>
              <button
                className="action-button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to propagate the mask? This action will apply the current mask to multiple frames.")) {
                    handlePropagateClick();
                  }
                }}
              >
                Propagate Mask
              </button>
              {frames.length > 0 && (
                <button
                  className="action-button"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to reset the video? This will reload the page.")) {
                      window.location.reload();
                    }
                  }}
                >
                  Reset Video
                </button>
              )}
              {frames.length > 0 && (
                <button
                  className="action-button"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to reset the state? This action cannot be undone.")) {
                      handleResetState();
                    }
                  }}
                >
                  Reset State
                </button>
              )}
              <button
                className="action-button"
                onClick={() => setShowMask(false)}  // Set showMask to false to stop displaying masks
              >
                Remove Mask
              </button>
              <button
                className="action-button"
                onClick={() => {
                  toggleMaskEditMode(false);  // Set EditMode to false (show predicted mask)
                  setShowMask(true);          // Ensure the mask is visible
              }}
              >
                Predicted Mask
              </button>
              <button
                className="action-button"
                onClick={() => {
                  toggleMaskEditMode(true);   // Set EditMode to true (show edited mask)
                  setShowMask(true);          // Ensure the mask is visible
              }}
              >
                Edited Mask
              </button>
              <button
                className={maskModeEdit ? "enabled-action-button action-button" : "disabled-action-button action-button"}
                onClick={handleConfirmFrame}
                disabled={!maskModeEdit}  // Disable button if not in edit mode
              >
                Confirm Frame
              </button>
              <button className="action-button">Confirm Video</button>
              <button className="action-button" onClick={downloadVideo}>
                Download Video - Mask
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}

// Two errors from SAM2 backed-end - "None-type not subscriptable" and "No points are provided; please add points first" are
// somewhat randomly appearing. Keep tabs and lookout for why these error are occurs to add additional failsafes. 