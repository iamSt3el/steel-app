// src/components/ToolBox/ToolBox.jsx
import React, { useState, useRef, useEffect } from 'react'
import styles from './ToolBox.module.scss'
import Button from '../Button/Button'
import { Eraser, MousePointer2, Pen, Minus } from 'lucide-react'
import { useToolContext } from '../../context/ToolContext'

const ToolBox = () => {
    const { currentTool, setCurrentTool, strokeWidth, setStrokeWidth, eraserWidth, setEraserWidth } = useToolContext();
    const [showSlider, setShowSlider] = useState(false);
    const sliderRef = useRef(null);
    const containerRef = useRef(null);

    const tools = [
        { id: 'pointer', Icon: MousePointer2, label: 'Select' },
        { id: 'pen', Icon: Pen, label: 'Pen' },
        { id: 'eraser', Icon: Eraser, label: 'Eraser' },
        { id: 'stroke-size', Icon: Minus, label: 'Stroke Size' }
    ];

    // Close slider when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSlider(false);
            }
        };

        if (showSlider) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSlider]);

    const handleToolClick = (toolId) => {
        if (toolId === 'stroke-size') {
            setShowSlider(!showSlider);
        } else {
            setCurrentTool(toolId);
            setShowSlider(false);
        }
    };

    const handleStrokeWidthChange = (e) => {
        setStrokeWidth(parseInt(e.target.value));
    };

    const handleEraserWidthChange = (e) => {
        setEraserWidth(parseInt(e.target.value));
    };

    return (
        <div className={styles.toolBoxContainer} ref={containerRef}>
            <div className={styles.outterBox}>
                {tools.map(tool => (
                    <Button 
                        key={tool.id}
                        Icon={tool.Icon} 
                        isActive={currentTool === tool.id || (tool.id === 'stroke-size' && showSlider)}
                        onClick={() => handleToolClick(tool.id)}
                        label={tool.label}
                    />
                ))}
            </div>
            {showSlider && (
                <div className={styles.sliderContainer} ref={sliderRef}>
                    <div className={styles.sliderGroup}>
                        <label className={styles.sliderLabel}>
                            Pen Size: {strokeWidth}px
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={strokeWidth}
                            onChange={handleStrokeWidthChange}
                            className={styles.slider}
                        />
                    </div>
                    <div className={styles.sliderGroup}>
                        <label className={styles.sliderLabel}>
                            Eraser Size: {eraserWidth}px
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="40"
                            value={eraserWidth}
                            onChange={handleEraserWidthChange}
                            className={styles.slider}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export default ToolBox