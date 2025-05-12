// src/components/ToolBox/ToolBox.jsx
import React, { useState, useRef, useEffect } from 'react'
import styles from './ToolBox.module.scss'
import Button from '../Button/Button'
import { Eraser, MousePointer2, Pen, Minus, Palette } from 'lucide-react'
import { useToolContext } from '../../context/ToolContext'

const ToolBox = () => {
    const { 
        currentTool, 
        setCurrentTool, 
        strokeWidth, 
        setStrokeWidth, 
        eraserWidth, 
        setEraserWidth,
        strokeColor,
        setStrokeColor
    } = useToolContext();
    
    const [showSlider, setShowSlider] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const sliderRef = useRef(null);
    const colorPickerRef = useRef(null);
    const containerRef = useRef(null);

    const tools = [
        { id: 'pointer', Icon: MousePointer2, label: 'Select' },
        { id: 'pen', Icon: Pen, label: 'Pen' },
        { id: 'eraser', Icon: Eraser, label: 'Eraser' },
        { id: 'stroke-size', Icon: Minus, label: 'Stroke Size' },
        { id: 'color-picker', Icon: Palette, label: 'Color Picker' }
    ];

    // Predefined color palette
    const colorPalette = [
        '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
        '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
        '#FFC0CB', '#A52A2A', '#808080', '#000080', '#008000'
    ];

    // Close popups when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSlider(false);
                setShowColorPicker(false);
            }
        };

        if (showSlider || showColorPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSlider, showColorPicker]);

    const handleToolClick = (toolId) => {
        if (toolId === 'stroke-size') {
            setShowSlider(!showSlider);
            setShowColorPicker(false);
        } else if (toolId === 'color-picker') {
            setShowColorPicker(!showColorPicker);
            setShowSlider(false);
        } else {
            setCurrentTool(toolId);
            setShowSlider(false);
            setShowColorPicker(false);
        }
    };

    const handleStrokeWidthChange = (e) => {
        setStrokeWidth(parseInt(e.target.value));
    };

    const handleEraserWidthChange = (e) => {
        setEraserWidth(parseInt(e.target.value));
    };

    const handleColorChange = (color) => {
        setStrokeColor(color);
        setShowColorPicker(false);
    };

    return (
        <div className={styles.toolBoxContainer} ref={containerRef}>
            <div className={styles.outterBox}>
                {tools.map(tool => (
                    <Button 
                        key={tool.id}
                        Icon={tool.Icon} 
                        isActive={
                            currentTool === tool.id || 
                            (tool.id === 'stroke-size' && showSlider) ||
                            (tool.id === 'color-picker' && showColorPicker)
                        }
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
            
            {showColorPicker && (
                <div className={styles.colorPickerContainer} ref={colorPickerRef}>
                    <div className={styles.colorPalette}>
                        {colorPalette.map(color => (
                            <button
                                key={color}
                                className={`${styles.colorOption} ${strokeColor === color ? styles.selected : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorChange(color)}
                                title={color}
                            />
                        ))}
                    </div>
                    <div className={styles.customColorSection}>
                        <label htmlFor="custom-color" className={styles.customColorLabel}>
                            Custom Color:
                        </label>
                        <input
                            id="custom-color"
                            type="color"
                            value={strokeColor}
                            onChange={(e) => handleColorChange(e.target.value)}
                            className={styles.customColorInput}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export default ToolBox