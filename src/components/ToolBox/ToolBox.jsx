// src/components/ToolBox/ToolBox.jsx
import React, { useState, useRef, useEffect } from 'react'
import styles from './ToolBox.module.scss'
import Button from '../Button/Button'
import { Eraser, MousePointer2, Pen, Palette, SlidersHorizontal, Circle } from 'lucide-react'
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
        setStrokeColor,
        strokePresets
    } = useToolContext();
    
    const [showSlider, setShowSlider] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showStrokePresets, setShowStrokePresets] = useState(false);
    const sliderRef = useRef(null);
    const colorPickerRef = useRef(null);
    const strokePresetsRef = useRef(null);
    const containerRef = useRef(null);

    const tools = [
        { id: 'pointer', Icon: MousePointer2, label: 'Select' },
        { id: 'pen', Icon: Pen, label: 'Pen' },
        { id: 'eraser', Icon: Eraser, label: 'Eraser' },
        { id: 'stroke-size', Icon: SlidersHorizontal, label: 'Stroke Size' },
        { id: 'color-picker', Icon: Palette, label: 'Color Picker' }
    ];

    // Enhanced color palette with better organization
    const colorPalette = [
        '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
        '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
        '#FFC0CB', '#A52A2A', '#808080', '#000080', '#008000',
        '#8B4513', '#FF1493', '#00CED1', '#FFD700', '#DC143C'
    ];

    // Stroke presets with visual indicators
    const strokePresetSizes = [
        { size: strokePresets.thin, label: 'Thin', icon: 'thin-line' },
        { size: strokePresets.medium, label: 'Medium', icon: 'medium-line' },
        { size: strokePresets.thick, label: 'Thick', icon: 'thick-line' },
        { size: strokePresets.bold, label: 'Bold', icon: 'bold-line' }
    ];

    // Close popups when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSlider(false);
                setShowColorPicker(false);
                setShowStrokePresets(false);
            }
        };

        if (showSlider || showColorPicker || showStrokePresets) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSlider, showColorPicker, showStrokePresets]);

    const handleToolClick = (toolId) => {
        if (toolId === 'stroke-size') {
            setShowSlider(!showSlider);
            setShowColorPicker(false);
            setShowStrokePresets(false);
        } else if (toolId === 'color-picker') {
            setShowColorPicker(!showColorPicker);
            setShowSlider(false);
            setShowStrokePresets(false);
        } else {
            setCurrentTool(toolId);
            setShowSlider(false);
            setShowColorPicker(false);
            setShowStrokePresets(false);
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

    const handleStrokePresetSelect = (size) => {
        setStrokeWidth(size);
        setShowSlider(false);
    };

    // Render stroke preview
    const renderStrokePreview = (size) => (
        <svg width="40" height="20" viewBox="0 0 40 20">
            <line
                x1="5"
                y1="10"
                x2="35"
                y2="10"
                stroke={strokeColor}
                strokeWidth={size}
                strokeLinecap="round"
            />
        </svg>
    );

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
            
            {/* Enhanced stroke size panel with presets */}
            {showSlider && (
                <div className={styles.sliderContainer} ref={sliderRef}>
                    {/* Quick presets */}
                    <div className={styles.strokePresets}>
                        <div className={styles.presetsHeader}>Quick Sizes</div>
                        <div className={styles.presetButtons}>
                            {strokePresetSizes.map(preset => (
                                <button
                                    key={preset.size}
                                    className={`${styles.presetButton} ${strokeWidth === preset.size ? styles.active : ''}`}
                                    onClick={() => handleStrokePresetSelect(preset.size)}
                                    title={`${preset.label} (${preset.size}px)`}
                                >
                                    {renderStrokePreview(preset.size)}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Custom size sliders */}
                    <div className={styles.sliderGroup}>
                        <label className={styles.sliderLabel}>
                            Pen Size: {strokeWidth}px
                        </label>
                        <div className={styles.sliderWrapper}>
                            <div className={styles.sliderPreview}>
                                {renderStrokePreview(strokeWidth)}
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="20"
                                value={strokeWidth}
                                onChange={handleStrokeWidthChange}
                                className={styles.slider}
                            />
                        </div>
                    </div>
                    
                    <div className={styles.sliderGroup}>
                        <label className={styles.sliderLabel}>
                            Eraser Size: {eraserWidth}px
                        </label>
                        <div className={styles.sliderWrapper}>
                            <div className={styles.eraserPreview}>
                                <Circle size={Math.min(20, eraserWidth)} fill="rgba(239, 68, 68, 0.3)" />
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                value={eraserWidth}
                                onChange={handleEraserWidthChange}
                                className={styles.slider}
                            />
                        </div>
                    </div>
                </div>
            )}
            
            {/* Enhanced color picker */}
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
                    
                    <div className={styles.colorPreview}>
                        <span className={styles.previewLabel}>Current Color:</span>
                        <div className={styles.currentColorSwatch} style={{ backgroundColor: strokeColor }}>
                            {renderStrokePreview(strokeWidth)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ToolBox