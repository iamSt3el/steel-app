// src/components/Canvas/Canvas.jsx
import React, { useRef, useEffect, useState } from 'react';
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Set initial canvas styles
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    
    // Create grid background
    drawGrid(context, width, height);
  }, [width, height]);

  // Update canvas styles when props change
  useEffect(() => {
    const context = canvasRef.current.getContext('2d');
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
  }, [strokeColor, strokeWidth]);

  const drawGrid = (ctx, canvasWidth, canvasHeight) => {
    ctx.save();
    
    // Set grid style - more subtle
    const gridSpacing = 20;
    
    // Draw grid dots instead of lines for cleaner look
    ctx.fillStyle = '#f0f0f0';
    
    for (let x = gridSpacing; x < canvasWidth; x += gridSpacing) {
      for (let y = gridSpacing; y < canvasHeight; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setLastPosition({ x, y });
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (currentTool === 'pen') {
      context.globalCompositeOperation = 'source-over';
      context.beginPath();
      context.moveTo(lastPosition.x, lastPosition.y);
      context.lineTo(x, y);
      context.stroke();
    } else if (currentTool === 'eraser') {
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(x, y, context.lineWidth * 2, 0, Math.PI * 2);
      context.fill();
    }
    
    setLastPosition({ x, y });
    onCanvasChange?.(canvas.toDataURL());
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(context, width, height);
    onCanvasChange?.(canvas.toDataURL());
  };

  // Get cursor class based on current tool
  const getCursorClass = () => {
    switch (currentTool) {
      case 'pen':
        return styles.penMode;
      case 'eraser':
        return styles.eraserMode;
      case 'pointer':
        return styles.selectMode;
      default:
        return '';
    }
  };

  return (
    <div className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${getCursorClass()}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
    </div>
  );
};

export default Canvas;