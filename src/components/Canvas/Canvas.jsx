import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import SmoothCanvas from '../SmoothCanvas';
import styles from './Canvas.module.scss';

const Canvas = forwardRef(({ 
  width = 800,
  height = 900,
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  eraserWidth = 10,
  onCanvasChange,
  initialData = null
}, ref) => {
  const canvasRef = useRef(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
  const hasLoadedData = useRef(false);

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
    },
    loadData: (dataURL) => {
      canvasRef.current?.loadData(dataURL);
    }
  }));

  // Load initial data when component mounts or when initialData changes
  useEffect(() => {
    if (initialData && canvasRef.current && !hasLoadedData.current) {
      canvasRef.current.loadData(initialData);
      hasLoadedData.current = true;
    }
    // Reset the flag when initialData changes
    if (!initialData) {
      hasLoadedData.current = false;
    }
  }, [initialData]);

  // Handle tool changes
  useEffect(() => {
    if (currentTool === 'eraser') {
      canvasRef.current?.eraseMode(true);
    } else {
      canvasRef.current?.eraseMode(false);
    }
  }, [currentTool]);

  // Create transparent background (dots will be handled by CSS)
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    setBackgroundImageUrl(canvas.toDataURL());
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
        eraserWidth={eraserWidth}
        onCanvasChange={onCanvasChange}
        backgroundImageUrl={backgroundImageUrl}
      />
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;