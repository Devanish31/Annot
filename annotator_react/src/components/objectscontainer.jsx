// Objectscontainer.jsx
import React, { useState, useEffect } from 'react';

export default function ObjectsContainer({ onObjectSelect, isObjectChangeAllowed, onReset, frames, selectedObjectId }) {
    const [selectedObject, setSelectedObject] = useState('');

    const handleObjectChange = (e) => {
        const newObjectId = e.target.value;
    
        // Prevent object change if no frames are displayed
        if (!frames || frames.length === 0) {
            alert('Please upload a video and display a frame before selecting an object.');
            return;
        }
    
        // Prevent object change if not allowed using the passed `isObjectChangeAllowed` prop
        if (!isObjectChangeAllowed()) {
            alert('Cannot change to another object while points or masks exist. Please remove all points or reset the inference state.');
            return;
        }
        
        // If object change is allowed, proceed
        setSelectedObject(newObjectId);
        onObjectSelect(newObjectId);  // Pass the selected object ID up to the parent component (App)
    };
    

    // Sync local state with the selectedObjectId prop from App.jsx
    useEffect(() => {
        if (selectedObjectId === null) {
            setSelectedObject('');  // Clear the local selected object when parent resets
        }
    }, [selectedObjectId]);

    useEffect(() => {
        if (onReset) {
            onReset(() => {
                // Reset both the local and parent states
                setSelectedObject('');  // Clear the local selected object
                onObjectSelect(null);   // Ensure the parent state is reset too
            });
        }
    }, [onReset]);

    return (
        <div className="object-selection-container">
            <h3 className="object-selection-heading">SELECT OBJECT</h3>
            <form className="object-selection-form">
                {['Solid Organ', 'Artery', 'Vein', 'Nerve', 'Bone', 'Muscle', 'Instrument', 'LN, Thoracic Duct', 'Others'].map((label, index) => (
                    <label
                        key={index}
                        className={`object-label ${selectedObject === String(index + 1) ? 'selected' : ''}`}
                    >
                        <input
                            type="radio"
                            value={index + 1}
                            checked={selectedObject === String(index + 1)}
                            onChange={handleObjectChange}
                            className="object-radio"
                        />
                        {label}
                    </label>
                ))}
            </form>
        </div>
    );
}

