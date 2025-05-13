// src/components/Canvas/Canvas.jsx
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import SmoothCanvas from '../SmoothCanvas';
import styles from './Canvas.module.scss';

const Canvas = forwardRef(({ 
  width = 900,
  height = 700,
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  onCanvasChange
}, ref) => {
  const canvasRef = useRef(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    eraseMode: (mode) => {
      canvasRef.current?.eraseMode(mode);
    },
    exportImage: async (format = 'png') => {
      return canvasRef.current?.exportImage(format) || '';
    },
    clearCanvas: () => {
      canvasRef.current?.clearCanvas();
    },
    undo: () => {
      canvasRef.current?.undo();
    }
  }));

  // Handle tool changes
  useEffect(() => {
    if (currentTool === 'eraser') {
      canvasRef.current?.eraseMode(true);
    } else {
      canvasRef.current?.eraseMode(false);
    }
  }, [currentTool]);

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
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      setBackgroundImageUrl(canvas.toDataURL());
    };
    
    createGridBackground();
  }, [width, height]);

  return (
    <div className={styles.canvasContainer}>
      <SmoothCanvas
        ref={canvasRef}
        width={width}
        height={height}
        currentTool={currentTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        onCanvasChange={onCanvasChange}
        backgroundImageUrl={backgroundImageUrl}
      />
      
      {/* Canvas controls */}
      <div className={styles.controls}>
        <button 
          className={styles.undoButton}
          onClick={() => canvasRef.current?.undo()}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button 
          className={styles.clearButton}
          onClick={() => canvasRef.current?.clearCanvas()}
          title="Clear Canvas"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;