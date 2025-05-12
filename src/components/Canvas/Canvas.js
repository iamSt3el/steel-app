import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Canvas.scss';

const Canvas = () => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [elements, setElements] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size to fill the container
    const resizeCanvas = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * 2; // High DPI support
      canvas.height = rect.height * 2;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      context.scale(2, 2); // Scale context for high DPI
      redraw();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Redraw all elements
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Clear canvas
    context.clearRect(0, 0, canvas.width / 2, canvas.height / 2);
    
    // Draw all elements
    elements.forEach(element => {
      if (element.type === 'path') {
        context.beginPath();
        context.strokeStyle = element.color;
        context.lineWidth = element.width;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        
        element.points.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        
        context.stroke();
      }
    });
  }, [elements]);

  // Get mouse position relative to canvas
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX / 2,
      y: (e.clientY - rect.top) * scaleY / 2
    };
  };

  // Mouse event handlers
  const startDrawing = (e) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setCurrentPath([pos]);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const pos = getMousePos(e);
    setCurrentPath(prev => [...prev, pos]);
    
    // Draw the current stroke
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    context.beginPath();
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    if (currentPath.length > 1) {
      const prevPoint = currentPath[currentPath.length - 2];
      context.moveTo(prevPoint.x, prevPoint.y);
      context.lineTo(pos.x, pos.y);
      context.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath.length > 0) {
      setElements(prev => [...prev, {
        type: 'path',
        points: currentPath,
        color: strokeColor,
        width: strokeWidth
      }]);
    }
    setIsDrawing(false);
    setCurrentPath([]);
  };

  // Clear canvas
  const clearCanvas = () => {
    setElements([]);
    redraw();
  };

  // Undo last action
  const undo = () => {
    setElements(prev => prev.slice(0, -1));
  };

  // Redraw when elements change
  useEffect(() => {
    redraw();
  }, [elements, redraw]);

  return (
    <div className="canvas-container">
      <div className="toolbar">
        <div className="toolbar-section">
          <button 
            className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
          >
            <span className="icon">✏️</span> Pen
          </button>
          <button 
            className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
          >
            <span className="icon">🧹</span> Eraser
          </button>
        </div>
        
        <div className="toolbar-section">
          <label>
            Width:
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            />
            <span>{strokeWidth}px</span>
          </label>
        </div>
        
        <div className="toolbar-section">
          <label>
            Color:
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </label>
        </div>
        
        <div className="toolbar-section">
          <button className="action-btn" onClick={undo}>
            <span className="icon">↶</span> Undo
          </button>
          <button className="action-btn" onClick={clearCanvas}>
            <span className="icon">🗑️</span> Clear
          </button>
        </div>
      </div>
      
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{ cursor: tool === 'pen' ? 'crosshair' : 'not-allowed' }}
        />
      </div>
    </div>
  );
};

export default Canvas;