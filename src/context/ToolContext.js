// src/context/ToolContext.js
import React, { createContext, useContext, useState, useMemo } from 'react';

const ToolContext = createContext();

export const useToolContext = () => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error('useToolContext must be used within a ToolProvider');
  }
  return context;
};

export const ToolProvider = ({ children }) => {
  const [currentTool, setCurrentTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3); // Reduced default for better feel
  const [eraserWidth, setEraserWidth] = useState(15); // Increased default

  // Stroke size presets based on Excalidraw
  const strokePresets = useMemo(() => ({
    thin: 2,
    medium: 3,
    thick: 5,
    bold: 8
  }), []);

  // Update strokeColor properly
  const handleStrokeColorChange = (color) => {
    setStrokeColor(color);
  };

  // Smart stroke width adjustment based on zoom level (if implemented)
  const getAdaptiveStrokeWidth = useMemo(() => {
    return (zoom = 1) => {
      // Ensure stroke width adapts to zoom for consistent visual thickness
      return Math.max(1, strokeWidth / zoom);
    };
  }, [strokeWidth]);

  // Stroke options optimized for different input types
  const getStrokeOptions = useMemo(() => {
    return (inputType = 'mouse') => {
      const baseOptions = {
        size: strokeWidth,
        smoothing: 0.8,
        streamline: 0.3,
        easing: (t) => t,
        start: { taper: 0, cap: true },
        end: { taper: strokeWidth * 0.2, cap: true }
      };

      switch (inputType) {
        case 'pen':
          return {
            ...baseOptions,
            smoothing: 0.7,
            streamline: 0.2,
            thinning: 0.5,
            simulatePressure: false,
            easing: (t) => Math.sqrt(t),
          };
        case 'touch':
          return {
            ...baseOptions,
            smoothing: 0.85,
            streamline: 0.4,
            thinning: 0.3,
            simulatePressure: true,
          };
        default: // mouse
          return {
            ...baseOptions,
            thinning: 0.4,
            simulatePressure: true,
          };
      }
    };
  }, [strokeWidth]);

  // Context value with enhanced tools
  const contextValue = useMemo(() => ({
    currentTool,
    setCurrentTool,
    strokeColor,
    setStrokeColor: handleStrokeColorChange,
    strokeWidth,
    setStrokeWidth,
    eraserWidth,
    setEraserWidth,
    strokePresets,
    getAdaptiveStrokeWidth,
    getStrokeOptions,
  }), [
    currentTool,
    strokeColor,
    strokeWidth,
    eraserWidth,
    strokePresets,
    getAdaptiveStrokeWidth,
    getStrokeOptions,
  ]);

  return (
    <ToolContext.Provider value={contextValue}>
      {children}
    </ToolContext.Provider>
  );
};