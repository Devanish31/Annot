// ToolsContainer.jsx
import React, { useState, useEffect, useCallback } from 'react';

export default function ToolsContainer({
    masksByObjectAndFrame,
    editedMasksByObjectAndFrame,
    setEditedMasksByObjectAndFrame,
    selectedObjectId,
    currentFrameIndex,
    toggleMaskEditMode,  // Function to toggle mask edit mode
    maskModeEdit,        // Boolean to track mask edit mode
    editedCanvasRef,     // Ref for the editing mask
    overlayBinaryMask,
    displayEditedMask,
    circleCanvasRef,
    maskUndoStack,
    maskRedoStack,
    setMaskUndoStack,
    setMaskRedoStack,
}) {
    const [selectedToolAction, setSelectedToolAction] = useState(null); // Track selected tool (brush, eraser, etc.)
    const [selectedSize, setSelectedSize] = useState(10);  // Default size is 10
    const [points, setPoints] = useState([]);  // Track points for polygon tool
    const [isDrawing, setIsDrawing] = useState(false); // Flag to track if polygon is being drawn
    const [polygons, setPolygons] = useState([]);  // Store all completed polygons
    const [lassoPointUndoStack, setLassoPointUndoStack] = useState([]);
    const [lassoPointRedoStack, setLassoPointRedoStack] = useState([]);
    const [polygonUndoStack, setPolygonUndoStack] = useState([]);  // Undo stack for polygons
    const [polygonRedoStack, setPolygonRedoStack] = useState([]);  // Redo stack for polygons

    // Define your custom colors based on object IDs
    const customColors = {
        1: [0, 0, 255],   // brown (solid organ)
        2: [255, 0, 0],   // red (artery)
        3: [0, 0, 255],   // blue (vein)
        4: [255, 255, 0], // yellow (nerve)
        5: [128, 0, 128], // purple (bone)
        6: [0, 255, 0],   // green (muscle)
        7: [255, 165, 0], // orange (instrument)
        8: [128, 128, 0], // olive green (LN)
        9: [128, 128, 128]// grey (other)
    };

    // Deselect tool when maskModeEdit is false
    useEffect(() => {
        if (!maskModeEdit) {
            setSelectedToolAction(null); // Deselect the tool when not in edit mode
        }
    }, [maskModeEdit]);

    // Check if a mask exists for the current frame and object
    const maskExistsForCurrentFrame = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex];

    const handleCanvasClick = (event) => {
        if (selectedToolAction !== 'Lasso') return;  // Only log points if Lasso is selected
    
        const canvas = editedCanvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });  // Get the canvas context
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Save the current state before adding a new point to the undo stack
        setLassoPointUndoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(points))]);
        setLassoPointRedoStack([]); // Clear redo stack after a new action
    
        // Log the point in the state
        setPoints((prevPoints) => [...prevPoints, { x, y }]);
    
        // Draw the point with the color based on the selected object
        drawPoint(ctx, x, y, selectedObjectId);
    
        if (!isDrawing) {
            setIsDrawing(true);  // Start drawing on the first click
        }
    };
    
    // Helper function to draw a point as a circle with a center dot
    const drawPoint = (ctx, x, y, selectedObjectId) => {
        const radius = 10;

        // Get color based on the selected object ID
        const color = customColors[selectedObjectId] || [0, 0, 0];  // Default to black if no color is defined

        // Convert RGB array to an RGBA string with 50% transparency
        const colorString = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`;  // 0.5 is for 50% transparency

        // Draw outer circle with 50% transparency
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.strokeStyle = colorString;  // Set the color of the circle's border with transparency
        ctx.lineWidth = 2;              // Set the line thickness for the outer circle
        ctx.stroke();                   // Draw the outer circle as an empty (hollow) circle

        // Draw center dot with 50% transparency
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI, false);  // A smaller dot in the center
        ctx.fillStyle = colorString;   // Center dot color with transparency
        ctx.fill();
    };

    const handleMouseMove = (event) => {
        if (selectedToolAction !== 'Lasso' || !isDrawing || points.length === 0) return;
    
        const canvas = editedCanvasRef.current;
        const ctx = canvas.getContext('2d');
    
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
    
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    
        // Redraw all previously completed polygons
        polygons.forEach(polygon => {
            drawPolygon(polygon.points, true, polygon.selectedObjectId);  // Redraw each polygon
        });
    
        // Redraw all the currently logged points for the active polygon
        points.forEach(({ x, y }) => {
            drawPoint(ctx, x, y, selectedObjectId);  // Draw the points of the current polygon
        });
        
        const lastPoint = points[points.length - 1];
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(x, y); // Dynamic line to cursor
        ctx.strokeStyle = `rgba(${customColors[selectedObjectId][0]}, ${customColors[selectedObjectId][1]}, ${customColors[selectedObjectId][2]}, 0.5)`;  // Color and transparency
        ctx.stroke();
    };
    
    // Handle double click to close the polygon
    const handleDoubleClick = (event) => {
        event.preventDefault();  // Disable the default double-click behavior
        if (selectedToolAction !== 'Lasso') return;  // Only trigger if Lasso tool is selected
    
        if (points.length > 2) {
            // Finalize the polygon when double-clicked
            setIsDrawing(false);  // Stop the drawing process
            setPolygons((prevPolygons) => {
                const newPolygons = [...prevPolygons, { points, selectedObjectId }];  // Store polygon
                
                // Save the current polygons to the undo stack before confirming the polygon
                setPolygonUndoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(prevPolygons))]);
                setPolygonRedoStack([]);  // Clear the redo stack after a new action
    
                // Redraw all polygons after adding the new one
                redrawAllPolygons(newPolygons);
    
                return newPolygons;
            });
    
            // Reset the points array after finalizing the polygon
            setPoints([]);
        }
    };

    // Function to undo lasso points and polygons
    const undoLasso = () => {
        console.log("Undoing Lasso"); // Debugging log
        console.log("Undo stack:", lassoPointUndoStack); // Log the current undo stack

        if (lassoPointUndoStack.length > 0) {
            const lastPointsState = lassoPointUndoStack[lassoPointUndoStack.length - 1];
            console.log("Restoring points to:", lastPointsState); // Log the points being restored

            setLassoPointUndoStack((prevStack) => prevStack.slice(0, -1));  // Remove the last state from undo stack
            setLassoPointRedoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(points))]);  // Save current state to redo stack
            setPoints(lastPointsState);  // Revert points to previous state
        } else if (polygonUndoStack.length > 0) {
            // Undo the last finalized polygon if there are no active points
            const lastPolygonsState = polygonUndoStack[polygonUndoStack.length - 1];
            console.log("Undoing polygon:", lastPolygonsState);  // Debugging log for polygons

            setPolygonUndoStack((prevStack) => prevStack.slice(0, -1));  // Remove the last state from undo stack
            setPolygonRedoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(polygons))]);  // Save current polygon state to redo stack
            setPolygons(lastPolygonsState);  // Revert polygons to previous state
            
            // After reverting, redraw all polygons
            redrawAllPolygons(lastPolygonsState);
        }
    };

    // Function to redo lasso points
    const redoLasso = () => {
        console.log("Redoing Lasso"); // Debugging log
        console.log("Redo stack:", lassoPointRedoStack); // Log the current redo stack
    
        if (lassoPointRedoStack.length > 0) {
            const redoPointsState = lassoPointRedoStack[lassoPointRedoStack.length - 1];
            console.log("Restoring points to:", redoPointsState); // Log the points being restored
    
            setLassoPointRedoStack((prevStack) => prevStack.slice(0, -1));  // Remove last state from redo stack
            setLassoPointUndoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(points))]);  // Save current state to undo stack
            setPoints(redoPointsState);  // Restore the redo state
        } else if (polygonRedoStack.length > 0) {
            // Redo the last undone polygon
            const redoPolygonsState = polygonRedoStack[polygonRedoStack.length - 1];
            setPolygonRedoStack((prevStack) => prevStack.slice(0, -1));  // Remove last state from redo stack
            setPolygonUndoStack((prevStack) => [...prevStack, JSON.parse(JSON.stringify(polygons))]);  // Save current state to undo stack
            setPolygons(redoPolygonsState);  // Restore the redo state
        }
    };

    // Keyboard Shortcuts for Undo/Redo (Lasso Points)
    useEffect(() => {
        const handleKeyDown = (event) => {
            console.log("Key pressed:", event.key, event.ctrlKey); // Debugging log
    
            if (event.ctrlKey && event.key === 'z') {
                event.preventDefault();
                console.log("Undo Lasso triggered"); // Debugging log
                undoLasso();  // Trigger lasso undo
            }
            if (event.ctrlKey && event.key === 'y') {
                event.preventDefault();
                console.log("Redo Lasso triggered"); // Debugging log
                redoLasso();  // Trigger lasso redo
            }
        };
    
        document.addEventListener('keydown', handleKeyDown);
    
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [lassoPointUndoStack, lassoPointRedoStack]);

    // Redraw all polygons function
    const redrawAllPolygons = (allPolygons) => {
        const canvas = editedCanvasRef.current;
        const ctx = canvas.getContext('2d');

        // Clear the canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Redraw each polygon in the list
        allPolygons.forEach(polygon => {
            drawPolygon(polygon.points, true, polygon.selectedObjectId);
        });
    };

    const drawPolygon = (points, closePolygon, selectedObjectId) => {
        const ctx = editedCanvasRef.current.getContext('2d');
        
        if (points.length < 2) return;
        
        // Get color based on the selected object ID with 50% transparency
        const color = customColors[selectedObjectId] || [0, 0, 0];  // Default to black if no color is defined
        const colorString = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`;  // 0.5 is for 50% transparency
    
        // Use a more opaque color for filling (you can change 0.3 to a different transparency if you prefer)
        const fillColorString = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3)`;  // Slightly transparent fill
    
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        // Draw curves between points (using quadratic bezier for now)
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
    
        // Curve back to the initial point
        ctx.quadraticCurveTo(points[points.length - 1].x, points[points.length - 1].y, points[0].x, points[0].y);
    
        if (closePolygon) {
            ctx.lineTo(points[0].x, points[0].y);  // Close the shape
        }
    
        // Fill the polygon with the fill color
        ctx.fillStyle = fillColorString;
        ctx.fill();  // Fill the inside of the polygon
    
        // Draw the outline of the polygon
        ctx.strokeStyle = colorString;  // Apply selected object color with 50% transparency
        ctx.lineWidth = 2;              // Set line thickness
        ctx.stroke();  // Draw the outline
    };
    
    useEffect(() => {
        const canvas = editedCanvasRef.current;

        if (!canvas) return;

        // Attach the event listeners for canvas click and double click
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('dblclick', handleDoubleClick);

        // Cleanup event listeners when the component unmounts
        return () => {
            canvas.removeEventListener('click', handleCanvasClick);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('dblclick', handleDoubleClick);
        };
    }, [selectedToolAction, isDrawing, points]);

    // Handle tool selection with mask existence check
    const handleToolSelection = (tool) => {
        if (!maskExistsForCurrentFrame) {
            alert('Tools will only be available after a mask has been predicted.');
            return;
        }
    
        if (selectedToolAction === tool) {
            // If the same tool is clicked again, deselect it and disable edit mode
            setSelectedToolAction(null);
            toggleMaskEditMode(false);  // Set edit mode to false
            console.log(`Exited edit mode: ${tool}`);
        } else {
            // Otherwise, select the new tool and enable edit mode
            setSelectedToolAction(tool);
            toggleMaskEditMode(true);  // Set edit mode to true
            console.log(`Entered edit mode: ${tool}`);
        }
    };
    
    // Helper function to apply both brush and eraser logic
    const applyToolAction = useCallback((toolAction, event) => {
        console.log(`Applying tool action: ${toolAction}, maskModeEdit: ${maskModeEdit}`);
        if (!selectedObjectId || currentFrameIndex === null || !editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex]) {
            alert('Please select an object, a frame, and ensure that an editable mask exists.');
            return;
        }
        console.log('Tool action can be applied');

        // Log that the edited mask is being displayed for the specific object and frame
        console.log(`Displaying edited mask for object ${selectedObjectId}, frame ${currentFrameIndex}`);

        const canvas = editedCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const frameImageElement = document.getElementById(`frameImage-${currentFrameIndex}`);

        if (!frameImageElement) {
            console.error("Frame image element not found.");
            return;
        }

        // Get the mask that we are currently editing
        const currentEditedMask = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || [];

        // Save the current mask state to the undo stack before editing
        setMaskUndoStack(prevStack => [...prevStack, JSON.parse(JSON.stringify(currentEditedMask))]);
        setMaskRedoStack([]);  // Clear the redo stack after new changes

        // Map tool action to corresponding function
        let updatedMask;
        if (toolAction === 'Brush') {
            updatedMask = applyBrush(currentEditedMask, event, ctx, frameImageElement);
        } else if (toolAction === 'Eraser') {
            updatedMask = applyEraser(currentEditedMask, event, ctx, frameImageElement);
        } else if (toolAction === 'Lasso') {
            // Lasso might need different logic
            updatedMask = applyLasso(currentEditedMask);
        }

        // Update the edited mask in state
        setEditedMasksByObjectAndFrame((prevEditedMasks) => ({
            ...prevEditedMasks,
            [selectedObjectId]: {
                ...prevEditedMasks[selectedObjectId],
                [currentFrameIndex]: updatedMask,
            },
        }));
    }, [editedCanvasRef, selectedToolAction, maskModeEdit, selectedObjectId, currentFrameIndex, editedMasksByObjectAndFrame, setEditedMasksByObjectAndFrame, selectedSize]);

    useEffect(() => {
        const canvas = editedCanvasRef.current;
    
        if (!canvas) {
            console.log("Canvas is not initialized or not available");
            return; // Exit early if the canvas doesn't exist
        }
    
        console.log("Canvas initialized, attaching event listeners");
    
        // Handle mouse down (start applying tool action on click)
        const handleMouseDown = (event) => {
            event.preventDefault(); // Prevent default browser behavior (e.g., drag preview)
            
            if (selectedToolAction && maskModeEdit) { // Check if a tool is selected
                applyToolAction(selectedToolAction, event);
                console.log(`Mouse down with tool: ${selectedToolAction}`);
            } else {
                console.log("No tool selected or edit mode is off");
            }
        };
    
        // Handle mouse move (continue applying tool action if mouse is held down)
        const handleMouseMove = (event) => {
            event.preventDefault(); // Prevent default drag behavior during mouse move
    
            if (event.buttons === 1 && selectedToolAction && maskModeEdit) { // If the left mouse button is held
                applyToolAction(selectedToolAction, event);
                console.log("Mouse moving and applying tool");
            }
        };
    
        // Handle mouse up (stop applying tool action when mouse is released)
        const handleMouseUp = () => {
            console.log("Mouse released, stop drawing");
        };
    
        // Add event listeners to the canvas
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
    
        // Cleanup event listeners on component unmount
        return () => {
            console.log("Cleaning up event listeners");
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
        };
    }, [editedCanvasRef, selectedToolAction, maskModeEdit, applyToolAction]);

    // Helper function to apply both brush and eraser logic
    const updateMaskAndRender = (mask, event, ctx, frameImageElement, isBrush) => {
        const canvas = editedCanvasRef.current;

        canvas.width = frameImageElement.width;
        canvas.height = frameImageElement.height;

        const scaleX = canvas.width / mask[0].length;
        const scaleY = canvas.height / mask.length;

        const rect = canvas.getBoundingClientRect();  // Get the bounding box of the canvas
        const xInMask = Math.floor((event.clientX - rect.left) / scaleX);
        const yInMask = Math.floor((event.clientY - rect.top) / scaleY);

        // Apply the tool to the mask (brush or eraser)
        const updatedMask = mask.map((row, y) =>
            row.map((pixel, x) => {
                const distance = Math.sqrt((x - xInMask) ** 2 + (y - yInMask) ** 2);
                // If the distance from the clicked point is small enough (like a brush stroke size), apply tool action
                if (distance <= selectedSize) {
                    return isBrush ? true : false;  // Set to true for brush, false for eraser
                }
                return pixel;  // Leave other pixels unchanged
            })
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        overlayBinaryMask(ctx, updatedMask, selectedObjectId, canvas.width, canvas.height);

        return updatedMask;
    };

    // Button-triggered Undo for Mask changes (Brush/Eraser)
    const handleUndo = () => {
        if (maskUndoStack.length > 0) {
            const lastMaskState = maskUndoStack[maskUndoStack.length - 1];
            setMaskRedoStack(prevStack => [...prevStack, JSON.parse(JSON.stringify(editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex]))]);  // Save current state to redo stack
            setMaskUndoStack(prevStack => prevStack.slice(0, -1));  // Remove the last state from the undo stack

            // Update the edited mask with the last undo state
            setEditedMasksByObjectAndFrame(prevMasks => ({
                ...prevMasks,
                [selectedObjectId]: {
                    ...prevMasks[selectedObjectId],
                    [currentFrameIndex]: lastMaskState,
                },
            }));
        }
    };

    // Button-triggered Redo for Mask changes (Brush/Eraser)
    const handleRedo = () => {
        if (maskRedoStack.length > 0) {
            const nextMaskState = maskRedoStack[maskRedoStack.length - 1];
            setMaskUndoStack(prevStack => [...prevStack, JSON.parse(JSON.stringify(editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex]))]);  // Save current state to undo stack
            setMaskRedoStack(prevStack => prevStack.slice(0, -1));  // Remove the last state from the redo stack

            // Update the edited mask with the redo state
            setEditedMasksByObjectAndFrame(prevMasks => ({
                ...prevMasks,
                [selectedObjectId]: {
                    ...prevMasks[selectedObjectId],
                    [currentFrameIndex]: nextMaskState,
                },
            }));
        }
    };

    // Apply brush
    const applyBrush = (mask, event, ctx, frameImageElement) => {
        return updateMaskAndRender(mask, event, ctx, frameImageElement, true);
    };

    // Apply eraser
    const applyEraser = (mask, event, ctx, frameImageElement) => {
        return updateMaskAndRender(mask, event, ctx, frameImageElement, false);
    };

    // Apply lasso (currently empty, you can add logic later)
    const applyLasso = (mask) => {
        console.log("Lasso tool selected, but functionality is not yet implemented.");
        
        // For now, just return the unmodified mask to avoid crashes
        return mask;
    };

    // Handle cursor drawing on a separate canvas
    useEffect(() => {
        const canvas = circleCanvasRef.current;
        if (!canvas) return;
    
        const ctx = canvas.getContext('2d');
    
        const frameImageElement = document.getElementById(`frameImage-${currentFrameIndex}`);
        if (frameImageElement) {
            // Set the canvas size to match the frame image
            canvas.width = frameImageElement.width;
            canvas.height = frameImageElement.height;
        }
    
        const handleMouseMove = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
    
            // Clear only the cursor canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
    
            if ((selectedToolAction === 'Brush' || selectedToolAction === 'Eraser') && maskModeEdit) {
                // Calculate the scale between the displayed canvas and the mask
                const mask = editedMasksByObjectAndFrame[selectedObjectId]?.[currentFrameIndex] || [];
                if (mask.length === 0) return;
    
                const scaleX = canvas.width / mask[0].length;
                const scaleY = canvas.height / mask.length;
    
                // Calculate the size of the cursor based on the same scaling logic used in the brush/eraser tool
                const scaledCursorSize = selectedSize * scaleX;  // Match the smallest scale factor
    
                // Draw the custom cursor circle
                ctx.beginPath();
                ctx.arc(x, y, scaledCursorSize, 0, 2 * Math.PI);
                ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";  // Semi-transparent black stroke
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.closePath();
            }
        };
    
        // Attach the `mousemove` event listener to the document
        document.addEventListener('mousemove', handleMouseMove);
    
        return () => {
            // Cleanup the event listener when the component unmounts
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [selectedToolAction, selectedSize, maskModeEdit, currentFrameIndex, editedMasksByObjectAndFrame, selectedObjectId]);
    

    return (
        <div className="tools-selection-container">
            <h3 className="tools-heading">TOOLS</h3>
            {/* Brush/Eraser Size Selector */}
            <div className="size-selector-container">
                {[10, 20, 40, 80].map((sizeOption) => (
                    <button
                        key={sizeOption}
                        className={`size-button ${selectedSize === sizeOption ? 'selected' : ''}`}
                        onClick={() => selectedToolAction && setSelectedSize(sizeOption)}  // Only set size if a tool is selected
                        disabled={!selectedToolAction}  // Disable if no tool (brush/eraser) is selected
                    >
                        {sizeOption}
                    </button>
                ))}
            </div>
            {/* Brush Tool */}
            <form className="tools-form">
                {['Brush', 'Eraser', 'Lasso'].map((tool, index) => (
                    <label
                        key={index}
                        className={`tool-label ${selectedToolAction === tool ? 'selected' : ''}`}
                    >
                        <input
                            type="radio"
                            value={tool}
                            checked={selectedToolAction === tool}
                            onClick={() => handleToolSelection(tool)}
                            className="tool-radio"
                        />
                        {tool}
                    </label>
                ))}
            </form>
            <button className="tool-button" onClick={handleUndo} disabled={maskUndoStack.length === 0}>
                Undo Mask
            </button>
            <button className="tool-button" onClick={handleRedo} disabled={maskRedoStack.length === 0}>
                Redo Mask
            </button>
        </div>
    );
}
