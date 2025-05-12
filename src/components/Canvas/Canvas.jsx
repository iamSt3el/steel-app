// src/components/Canvas/Canvas.jsx
import React, { useRef, useEffect, useState } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import styles from './Canvas.module.scss';

const Canvas = ({ 
  width = 900,
  height = 700,
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  onCanvasChange
}) => {
  const canvasRef = useRef(null);
  const [eraseMode, setEraseMode] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');

  // Handle tool changes
  useEffect(() => {
    if (currentTool === 'pen') {
      setEraseMode(false);
      canvasRef.current?.eraseMode(false);
    } else if (currentTool === 'eraser') {
      setEraseMode(true);
      canvasRef.current?.eraseMode(true);
    }
  }, [currentTool]);

  // Handle canvas changes
  const handleStroke = () => {
    if (!canvasRef.current || !onCanvasChange) return;
    
    canvasRef.current.exportImage('png').then(dataUrl => {
      onCanvasChange(dataUrl);
    });
  };

  // Create grid background
  useEffect(() => {
    const createGridBackground = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const gridSize = 20;
      
      canvas.width = width;
      canvas.height = height;
      
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Draw grid dots
      ctx.fillStyle = '#f0f0f0';
      for (let x = gridSize; x < width; x += gridSize) {
        for (let y = gridSize; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      setBackgroundImageUrl(canvas.toDataURL());
    };
    
    createGridBackground();
  }, [width, height]);

  return (
    <ReactSketchCanvas
      ref={canvasRef}
      width={width}
      height={height}
      strokeWidth={strokeWidth}
      strokeColor={strokeColor}
      backgroundImage={backgroundImageUrl}
      eraserWidth={strokeWidth * 2}
      onStroke={handleStroke}
      preserveBackgroundImageAspectRatio="none"
    />
  );
};

export default Canvas;