import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function FrameViewer({
    frames,
    currentFrameIndex,
    selectedObjectId,
    onUpload,
    pointsByObjectAndFrame,
    setPointsByObjectAndFrame,
    masksByObjectAndFrame,
    onReset,
    maskModeEdit, // To determine whether in edit mode
    canvasRef, // Receive the canvasRef from App.jsx
    editedCanvasRef,     // Ref for the editing mask
    circleCanvasRef,
    overlayBinaryMask,
    displayPredictedMask
}) {
    const [videoFile, setVideoFile] = useState(null);
    const [undoStack, setUndoStack] = useState([]); // Stack for undo
    const [redoStack, setRedoStack] = useState([]); // Stack for redo
    const [videoDimensions, setVideoDimensions] = useState({ width: null, height: null });

    // Get current frame points from pointsByFrame or default to empty array
    const currentFramePoints = pointsByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || [];

    // Access the mask for the current frame and object
    const currentMask = masksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];

    const getFirstFrameWithPoints = (objectId) => {
        const objectPoints = pointsByObjectAndFrame[objectId];
        if (!objectPoints) return null;
      
        // Find the first frame index with points for the given object
        const frameIndices = Object.keys(objectPoints).map(Number); // Convert keys to numbers
        const firstFrameWithPoints = frameIndices.find(
          (frameIndex) => objectPoints[frameIndex].length > 0
        );
      
        return firstFrameWithPoints ?? null;
      };

    // Handle video file upload
    const handleFileChange = (file) => {
        if (file) {
            setVideoFile(file);
            onUpload(file);
        }
    };

    useEffect(() => {
        if (videoFile) {
            // You can also use this hook to handle further state changes after upload
        }
    }, [videoFile]);

    // Add this to load dimensions when the image (frame) loads
    const handleImageLoad = (e) => {
        const imgElement = e.target;
        const imgWidth = imgElement.naturalWidth;
        const imgHeight = imgElement.naturalHeight;

        setVideoDimensions({ width: imgWidth, height: imgHeight }); // Store the original video dimensions
        console.log(`Original Video Dimensions: ${imgWidth}x${imgHeight}`);
    };

    // Handle drag-and-drop upload
    const onDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        handleFileChange(file);
    }, []);

    const onDragOver = useCallback((e) => {
        e.preventDefault();
    }, []);

    // Handle click on the frame for point annotation
    const handleFrameClick = (e) => {
        if (maskModeEdit) {
            // Prevent adding points when in mask edit mode
            console.log("Frame click disabled in edit mode.");
            return;
        }
        
        if (!selectedObjectId) {
            alert('Please select an object before annotating points.');
            return;
        }
    
        // Dynamically calculate the first frame with points for the selected object
        const firstFrameForObject = getFirstFrameWithPoints(selectedObjectId);
    
        // Prevent adding points on any frame other than the first frame where points were added
        if (firstFrameForObject !== null && firstFrameForObject !== currentFrameIndex) {
            alert(`You can only add points on frame ${firstFrameForObject + 1} for this object.`);
            return;
        }
    
        // Ensure the original video dimensions are set
        if (!videoDimensions.width || !videoDimensions.height) {
            console.error("Original video dimensions are not set.");
            return;
        }
    
        // Get the bounding box of the displayed image (frame)
        const rect = e.target.getBoundingClientRect();
    
        // Calculate the clicked position relative to the displayed image (unscaled x, y)
        const unscaledX = e.clientX - rect.left;
        const unscaledY = e.clientY - rect.top;
    
        // Get the displayed image size
        const displayedWidth = rect.width;
        const displayedHeight = rect.height;
    
        // Scale the coordinates back to the original video size (scaled x, y)
        const scaledX = Math.floor((unscaledX / displayedWidth) * videoDimensions.width);
        const scaledY = Math.floor((unscaledY / displayedHeight) * videoDimensions.height);
    
        // Differentiate between left-click and right-click
        const label = e.button === 0 ? 1 : 0; // Left click = 1 (green), Right click = 0 (red)
    
        console.log(`Scaled Click: (${scaledX}, ${scaledY}) from (${unscaledX}, ${unscaledY}), Label: ${label}`);
    
        // Check if the point already exists (based on scaled x and y)
        const pointExists = currentFramePoints.some((point) => point.scaledX === scaledX && point.scaledY === scaledY);
    
        if (!pointExists) {
            // Add the new point only if it doesn't already exist (store both scaled and unscaled positions)
            const newPoint = { scaledX, scaledY, unscaledX, unscaledY, label };
    
            // Update the points for the current frame in pointsByFrame
            setPointsByObjectAndFrame((prevPointsByObjectAndFrame) => {
                const updatedPointsForFrame = [...(prevPointsByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || []), newPoint];
                return {
                    ...prevPointsByObjectAndFrame,
                    [selectedObjectId]: {
                        ...prevPointsByObjectAndFrame[selectedObjectId], // Keep other frames for this object
                        [currentFrameIndex]: updatedPointsForFrame, // Update points for the current frame
                    },
                };
            });
    
            setUndoStack([...undoStack, newPoint]);
            setRedoStack([]); // Clear redo stack on new action
        } else {
            console.log('Point already exists at:', { scaledX, scaledY });
        }
    };
    

    useEffect(() => {
        console.log('Updated pointsByObjectAndFrame:', pointsByObjectAndFrame);
        console.log('Current Frame Points:', currentFramePoints);
    }, [pointsByObjectAndFrame, currentFramePoints]);  // Trigger this effect whenever pointsByObjectAndFrame or currentFramePoints is updated

    // Handle Undo
    const handleUndo = () => {
        if (undoStack.length === 0 || currentFramePoints.length === 0) {
            console.log('Undo stack is empty or no points in the current frame for the selected object');
            return;
        }

        // Remove the last point from the undo stack
        const lastPoint = undoStack[undoStack.length - 1];

        // Remove it from the points array and push it to the redo stack
        setUndoStack(undoStack.slice(0, -1));
        setRedoStack([lastPoint, ...redoStack]); // Add to redo stack

        // Update points for the current frame
        setPointsByObjectAndFrame((prevPointsByObjectAndFrame) => {
            const updatedPointsForFrame = currentFramePoints.slice(0, -1); // Remove the last point
    
            // If no points are left in the frame, remove the frame key
            if (updatedPointsForFrame.length === 0) {
                const { [currentFrameIndex]: _, ...remainingFrames } = prevPointsByObjectAndFrame[selectedObjectId];

                // If no other frames have points for the selected object, remove the object key too
                if (Object.keys(remainingFrames).length === 0) {
                    const { [selectedObjectId]: __, ...remainingObjects } = prevPointsByObjectAndFrame;
                    return remainingObjects;
                } else {
                    return {
                        ...prevPointsByObjectAndFrame,
                        [selectedObjectId]: remainingFrames, // Keep other frames for this object
                    };
                }
            }
            
            return {
                ...prevPointsByObjectAndFrame,
                [selectedObjectId]: {
                    ...prevPointsByObjectAndFrame[selectedObjectId], // Keep other frames for this object
                    [currentFrameIndex]: updatedPointsForFrame,      // Update points only for the current frame
                },
            };
        });
    };

    // Handle Redo
    const handleRedo = () => {
        if (redoStack.length === 0) {
            console.log('Redo stack is empty or no points in the current frame for the selected object');
            return;
        }

        // Get the last undone point from the redo stack
        const lastRedoPoint = redoStack[0];

        // Add it back to the points array and push it back to the undo stack
        setRedoStack(redoStack.slice(1)); // Remove from redo stack
        setUndoStack([...undoStack, lastRedoPoint]); // Add back to undo stack

        // Update points for the current frame
        setPointsByObjectAndFrame((prevPointsByObjectAndFrame) => {
            const updatedPointsForFrame = [...currentFramePoints, lastRedoPoint]; // Add the lastRedoPoint
    
            return {
                ...prevPointsByObjectAndFrame,
                [selectedObjectId]: {
                    ...prevPointsByObjectAndFrame[selectedObjectId], // Keep other frames for this object
                    [currentFrameIndex]: updatedPointsForFrame,      // Update points only for the current frame
                },
            };
        });
    };

    // Render crosses for each point with interactive removal
    const renderCrosses = () => {
        if (maskModeEdit) {
            return null; // Do not render crosses when in edit mode
        }
        
        return currentFramePoints.map((point, index) => (
            <div
                key={index}
                onClick={() => handleCrossClick(index)}
                onContextMenu={(e) => e.preventDefault()} // Disable right-click context menu on crosses
                className={`cross ${point.label === 1 ? 'cross-green' : 'cross-red'}`} 
                style={{
                    left: `${point.unscaledX}px`, // Use unscaled x for rendering the cross
                    top: `${point.unscaledY}px`,  // Use unscaled y for rendering the cross
                }}
            >
                {point.label === 1 ? '+' : '-'} {/* '+' for left-click, '-' for right-click */}
            </div>
        ));
    };

    // Handle cross click to remove a point
    const handleCrossClick = (index) => {
        // Update points for the current object and frame
        setPointsByObjectAndFrame((prevPointsByObjectAndFrame) => {
            const updatedPointsForFrame = currentFramePoints.filter((_, i) => i !== index);
            
            // If no points are left in the frame, remove the frame key
            if (updatedPointsForFrame.length === 0) {
                const { [currentFrameIndex]: _, ...remainingFrames } = prevPointsByObjectAndFrame[selectedObjectId];

                // If no other frames have points for the selected object, remove the object key too
                if (Object.keys(remainingFrames).length === 0) {
                    const { [selectedObjectId]: __, ...remainingObjects } = prevPointsByObjectAndFrame;
                    return remainingObjects;
                } else {
                    return {
                        ...prevPointsByObjectAndFrame,
                        [selectedObjectId]: remainingFrames, // Keep other frames for this object
                    };
                }
            }

            return {
                ...prevPointsByObjectAndFrame,
                [selectedObjectId]: {
                    ...prevPointsByObjectAndFrame[selectedObjectId], // Keep other frames for this object
                    [currentFrameIndex]: updatedPointsForFrame,      // Update points for the current frame
                },
            };
        });
    
        // Update undo stack by removing the point at the given index
        setUndoStack(undoStack.filter((_, i) => i !== index));
    
        console.log('Cross removed at index:', index);
    };

    // Disable context menu on right-click
    const disableContextMenu = (e) => {
        e.preventDefault(); // Prevent the context menu from showing
    };

    useEffect(() => {
        if (onReset) {
            // Call the onReset function passed from App.jsx
            onReset(() => {
                // Clear undo/redo stacks and other relevant states
                setUndoStack([]);
                setRedoStack([]);
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            });
        }
    }, [onReset]);

    return (
        <div className="frame-viewer-container">
            {!videoFile && (
                <div
                    className="upload-box"
                    onClick={() => document.getElementById('fileInput').click()}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                >
                    Drag & Drop or Click to Upload Video
                </div>
            )}
            <input 
                type="file"
                id="fileInput"
                style={{ display: 'none' }}
                accept="video/mp4"
                onChange={(e) => handleFileChange(e.target.files[0])}
            />
            {frames.length > 0 && (
                <> 
                    <div className="frame-container">
                        <img 
                            id={`frameImage-${currentFrameIndex}`}
                            src={frames[currentFrameIndex]}
                            alt={`Frame ${currentFrameIndex + 1}`} 
                            className="frame-image"
                            onMouseDown={handleFrameClick} // Placeholder for click handling
                            onLoad={handleImageLoad} // Set dimensions when image is loaded
                            onContextMenu={disableContextMenu}  // Disable right-click context menu only on frame
                        />
                        {!maskModeEdit && (
                        <canvas
                            ref={canvasRef}
                            className="mask-canvas"
                            />
                        )}
                        {/* Conditionally render the edited mask canvas based on edit mode */}
                        {maskModeEdit && (
                        <canvas
                            ref={editedCanvasRef}  // Ref for the edited mask
                            className="edited-mask-canvas"
                        />
                        )}
                        {maskModeEdit && (
                            <canvas
                                ref={circleCanvasRef} // Render the new circle canvas
                                className={`circle-canvas ${maskModeEdit ? 'active' : ''}`}  // Apply the CSS class
                            />
                        )}
                        {/* Render crosses for annotated points */}
                        {renderCrosses()}

                    </div>
                    <div className="controls-container">
                        <button 
                            onClick={handleUndo}
                            disabled={undoStack.length === 0}
                            className="control-button"
                            aria-label="Undo Last Action" // Accessibility enhancement
                        >
                            Undo Click
                        </button>
                        <button 
                            onClick={handleRedo}
                            disabled={redoStack.length === 0}
                            className="control-button"
                            aria-label="Redo Last Action" // Accessibility enhancement
                        >
                            Redo Click
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
