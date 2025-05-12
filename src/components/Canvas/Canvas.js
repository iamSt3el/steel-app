import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Canvas.scss';

const Canvas = () => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [pages, setPages] = useState([[]]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [isSliding, setIsSliding] = useState(false);
  
  // For smooth drawing
  const [lastPoint, setLastPoint] = useState(null);
  const [tempStrokes, setTempStrokes] = useState([]);

  const currentPage = pages[currentPageIndex] || [];
  
  // A4 aspect ratio (210mm x 297mm = 0.707)
  const A4_RATIO = 210 / 297;
  const PAGE_WIDTH = 800; // Fixed width for A4
  const PAGE_HEIGHT = PAGE_WIDTH / A4_RATIO;

  // Initialize canvas context with A4 dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size to A4 proportions with high DPI support
    canvas.width = PAGE_WIDTH * 2; // High DPI support
    canvas.height = PAGE_HEIGHT * 2;
    canvas.style.width = PAGE_WIDTH + 'px';
    canvas.style.height = PAGE_HEIGHT + 'px';
    context.scale(2, 2); // Scale context for high DPI
    
    // Set context properties for smooth drawing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    redraw();
  }, []);

  // Calculate distance between two points
  const distance = (p1, p2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // Draw variable width stroke with smooth transitions
  const drawVariableWidthStroke = (context, points) => {
    if (points.length < 2) return;
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      
      // Create gradient for variable width
      const gradient = context.createLinearGradient(
        prevPoint.x, prevPoint.y,
        currPoint.x, currPoint.y
      );
      
      // Draw multiple overlapping circles for smooth width transition
      const steps = Math.max(2, Math.floor(distance(prevPoint, currPoint)));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const x = prevPoint.x + (currPoint.x - prevPoint.x) * t;
        const y = prevPoint.y + (currPoint.y - prevPoint.y) * t;
        const width = prevPoint.width + (currPoint.width - prevPoint.width) * t;
        
        context.beginPath();
        context.arc(x, y, width / 2, 0, 2 * Math.PI);
        context.fillStyle = context.strokeStyle;
        context.fill();
      }
    }
  };

  // Draw a single stroke segment with proper pressure
  const drawStrokeSegment = (context, points) => {
    if (points.length < 2) return;
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      
      // Calculate distance for smooth interpolation
      const dist = distance(prevPoint, currPoint);
      const steps = Math.max(1, Math.floor(dist / 2));
      
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const x = prevPoint.x + (currPoint.x - prevPoint.x) * t;
        const y = prevPoint.y + (currPoint.y - prevPoint.y) * t;
        const width = prevPoint.width + (currPoint.width - prevPoint.width) * t;
        
        context.beginPath();
        context.arc(x, y, width / 2, 0, 2 * Math.PI);
        context.fill();
      }
    }
  };

  // Optimized eraser function that removes intersecting strokes
  const eraseStrokes = useCallback((eraserPoint, eraserRadius) => {
    return currentPage.filter(element => {
      if (element.type === 'eraser') return true; // Keep eraser strokes for history
      
      // Check if any point in the stroke is within eraser radius
      return !element.points.some(point => {
        const dist = distance(point, eraserPoint);
        return dist < eraserRadius;
      });
    });
  }, [currentPage]);

  // Redraw all elements
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Clear canvas with white background
    context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    
    // Draw notebook lines
    context.strokeStyle = 'rgba(0, 0, 255, 0.1)';
    context.lineWidth = 1;
    context.setLineDash([]);
    
    // Horizontal lines (ruled paper)
    for (let y = 30; y < PAGE_HEIGHT; y += 30) {
      context.beginPath();
      context.moveTo(60, y);
      context.lineTo(PAGE_WIDTH - 30, y);
      context.stroke();
    }
    
    // Red margin line
    context.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(60, 0);
    context.lineTo(60, PAGE_HEIGHT);
    context.stroke();
    
    // Reset styles for drawing
    context.setLineDash([]);
    context.globalCompositeOperation = 'source-over';
    
    // Draw all elements on current page
    currentPage.forEach(element => {
      if (element.type === 'path') {
        context.fillStyle = element.color;
        drawStrokeSegment(context, element.points);
      }
    });
    
    // Draw temporary strokes for real-time feedback
    tempStrokes.forEach(stroke => {
      context.fillStyle = stroke.color;
      drawStrokeSegment(context, stroke.points);
    });
  }, [currentPage, tempStrokes]);

  // Get mouse position relative to canvas
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: (e.clientX - rect.left) * (PAGE_WIDTH / rect.width),
      y: (e.clientY - rect.top) * (PAGE_HEIGHT / rect.height)
    };
  };

  // Get pointer event information including pressure
  const getPointerInfo = (e) => {
    const pos = getMousePos(e);
    const now = performance.now();
    
    // Calculate velocity if we have a previous point
    let velocity = 0;
    if (lastPoint) {
      const dist = distance(pos, lastPoint);
      const timeDiff = now - (lastPoint.timestamp || now - 16);
      velocity = dist / Math.max(timeDiff, 1);
    }
    
    // Get pressure from input device or simulate based on velocity
    let pressure = 0.5;
    
    // Check for pointer events with pressure support
    if (e.pressure !== undefined && e.pressure > 0) {
      pressure = e.pressure;
    } else if (e.pointerType === 'pen') {
      // For pen input without pressure, use a default
      pressure = 0.7;
    } else {
      // Simulate pressure based on velocity for mouse/touch
      // Slower movement = more pressure (like pressing harder)
      pressure = Math.max(0.2, Math.min(1.0, 1.0 - (velocity * 0.01)));
    }
    
    // Apply pressure to width
    const width = strokeWidth * pressure;
    
    return {
      x: pos.x,
      y: pos.y,
      pressure,
      width: Math.max(1, width),
      timestamp: now,
      velocity
    };
  };

  // Mouse event handlers
  const startDrawing = (e) => {
    e.preventDefault();
    const pointerInfo = getPointerInfo(e);
    setIsDrawing(true);
    setLastPoint(pointerInfo);
    
    if (tool === 'eraser') {
      // For eraser, immediately start erasing
      const eraserRadius = strokeWidth * 2;
      setPages(prev => {
        const newPages = [...prev];
        newPages[currentPageIndex] = eraseStrokes(pointerInfo, eraserRadius);
        return newPages;
      });
    } else {
      // Start new stroke with initial point
      setCurrentStroke([pointerInfo]);
      
      // Create temporary stroke for immediate feedback
      setTempStrokes([{
        color: strokeColor,
        points: [pointerInfo]
      }]);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const pointerInfo = getPointerInfo(e);
    
    if (tool === 'eraser') {
      // Fast erasing - remove strokes that intersect with eraser
      const eraserRadius = strokeWidth * 2;
      setPages(prev => {
        const newPages = [...prev];
        const filteredStrokes = newPages[currentPageIndex].filter(element => {
          if (element.type === 'eraser') return true;
          
          return !element.points.some(point => {
            const dist = distance(point, pointerInfo);
            return dist < eraserRadius;
          });
        });
        newPages[currentPageIndex] = filteredStrokes;
        return newPages;
      });
    } else {
      // Add point to current stroke
      setCurrentStroke(prev => {
        const newStroke = [...prev, pointerInfo];
        
        // Update temporary stroke for real-time display
        setTempStrokes([{
          color: strokeColor,
          points: newStroke
        }]);
        
        return newStroke;
      });
    }
    
    setLastPoint(pointerInfo);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    if (tool !== 'eraser' && currentStroke.length > 0) {
      // Add completed stroke to page
      const newElement = {
        type: 'path',
        points: currentStroke,
        color: strokeColor,
        baseWidth: strokeWidth
      };

      setPages(prev => {
        const newPages = [...prev];
        newPages[currentPageIndex] = [...currentPage, newElement];
        return newPages;
      });
    }
    
    setIsDrawing(false);
    setCurrentStroke([]);
    setTempStrokes([]);
    setLastPoint(null);
  };

  // Clear current page
  const clearCanvas = () => {
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentPageIndex] = [];
      return newPages;
    });
    setTempStrokes([]);
  };

  // Undo last action on current page
  const undo = () => {
    if (currentPage.length === 0) return;
    
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentPageIndex] = currentPage.slice(0, -1);
      return newPages;
    });
  };

  // Navigate to previous page
  const previousPage = () => {
    if (currentPageIndex > 0 && !isSliding) {
      setIsSliding(true);
      setCurrentPageIndex(prev => prev - 1);
      setTimeout(() => setIsSliding(false), 300);
    }
  };

  // Navigate to next page
  const nextPage = () => {
    if (!isSliding) {
      setIsSliding(true);
      if (currentPageIndex === pages.length - 1) {
        setPages(prev => [...prev, []]);
      }
      setCurrentPageIndex(prev => prev + 1);
      setTimeout(() => setIsSliding(false), 300);
    }
  };

  // Touch handling
  const [touchStart, setTouchStart] = useState(null);

  const handleTouchStart = (e) => {
    e.preventDefault();
    setTouchStart(e.targetTouches[0].clientX);
    
    // Create a pointer-like event for drawing
    const touch = e.targetTouches[0];
    const pointerEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      pressure: touch.force || 0.5, // Use force if available
      pointerType: 'touch'
    };
    startDrawing(pointerEvent);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.targetTouches[0];
    const pointerEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      pressure: touch.force || 0.5,
      pointerType: 'touch'
    };
    draw(pointerEvent);
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    stopDrawing();
    
    if (!touchStart) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && !isDrawing) {
      nextPage();
    }
    if (isRightSwipe && !isDrawing) {
      previousPage();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            previousPage();
            break;
          case 'ArrowRight':
            e.preventDefault();
            nextPage();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPageIndex, pages.length]);

  // Redraw when necessary
  useEffect(() => {
    redraw();
  }, [currentPageIndex, pages, redraw]);

  // Prevent context menu
  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('contextmenu', handleContextMenu);
      return () => canvas.removeEventListener('contextmenu', handleContextMenu);
    }
  }, []);

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
              disabled={tool === 'eraser'}
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

        <div className="toolbar-section">
          <button 
            className="action-btn" 
            onClick={previousPage}
            disabled={currentPageIndex === 0}
          >
            <span className="icon">←</span> Previous
          </button>
          <span className="page-indicator">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
          <button className="action-btn" onClick={nextPage}>
            <span className="icon">→</span> Next
          </button>
        </div>
      </div>
      
      <div className="canvas-viewport">
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ 
              cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'grab' : 'default',
              transition: isSliding ? 'transform 0.3s ease' : 'none',
              touchAction: 'none'
            }}
          />
          
          {isSliding && (
            <div className="slide-indicator">
              Switching to page {currentPageIndex + 1}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Canvas;