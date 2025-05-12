// src/components/SmoothCanvas/SmoothCanvas.jsx
import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { getStroke } from 'perfect-freehand';
import styles from './SmoothCanvas.module.scss';

const SmoothCanvas = forwardRef(({ 
  width = 900,
  height = 700,
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 5,
  eraserWidth = 10,
  onCanvasChange,
  backgroundImageUrl = null
}, ref) => {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [paths, setPaths] = useState([]);
  const [isErasing, setIsErasing] = useState(false);

  // Stroke options for perfect-freehand
  const strokeOptions = {
    size: strokeWidth,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => t,
    start: {
      taper: 0,
      cap: true
    },
    end: {
      taper: 100,
      cap: true
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    eraseMode: (mode) => setIsErasing(mode),
    exportImage: async (format = 'png') => {
      return exportCanvas(format);
    },
    clearCanvas: () => {
      clearCanvas();
    },
    undo: () => {
      undo();
    }
  }));

  // Convert stroke points to SVG path
  const getSvgPathFromStroke = (stroke) => {
    if (!stroke.length) return '';

    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ['M', ...stroke[0], 'Q']
    );

    d.push('Z');
    return d.join(' ');
  };

  // Get point from pointer event
  const getPointFromEvent = (e, rect) => {
    return [
      e.clientX - rect.left,
      e.clientY - rect.top,
      e.pressure || 0.5
    ];
  };

  // Handle pointer down
  const handlePointerDown = useCallback((e) => {
    if (!canvasRef.current) return;
    
    setIsDrawing(true);
    e.preventDefault();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const point = getPointFromEvent(e, rect);
    
    if (isErasing) {
      handleErase(point[0], point[1]);
    } else {
      setCurrentPath([point]);
    }
  }, [isErasing]);

  // Handle pointer move
  const handlePointerMove = useCallback((e) => {
    if (!isDrawing || !canvasRef.current) return;
    
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const point = getPointFromEvent(e, rect);
    
    if (isErasing) {
      handleErase(point[0], point[1]);
    } else {
      setCurrentPath(prev => [...prev, point]);
    }
  }, [isDrawing, isErasing]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    
    if (!isErasing && currentPath.length > 0) {
      const stroke = getStroke(currentPath, strokeOptions);
      const pathData = getSvgPathFromStroke(stroke);
      
      setPaths(prev => [...prev, {
        pathData,
        color: strokeColor,
        type: 'stroke'
      }]);
      
      setCurrentPath([]);
      
      // Notify parent of change
      if (onCanvasChange) {
        setTimeout(() => {
          exportCanvas('png').then(dataUrl => {
            onCanvasChange(dataUrl);
          });
        }, 10);
      }
    }
  }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, onCanvasChange]);

  // Handle erasing
  const handleErase = (x, y) => {
    setPaths(prev => {
      const newPaths = prev.filter(pathObj => {
        if (pathObj.type === 'stroke') {
          // Simple collision detection for eraser
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathObj.pathData);
          svg.appendChild(path);
          
          const point = svg.createSVGPoint();
          point.x = x;
          point.y = y;
          
          return !path.isPointInStroke?.(point);
        }
        return true;
      });
      
      if (newPaths.length !== prev.length && onCanvasChange) {
        setTimeout(() => {
          exportCanvas('png').then(dataUrl => {
            onCanvasChange(dataUrl);
          });
        }, 10);
      }
      
      return newPaths;
    });
  };

  // Clear canvas
  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath([]);
    const tempPath = svgRef.current?.querySelector('#temp-path');
    if (tempPath) tempPath.remove();
    
    if (onCanvasChange) {
      setTimeout(() => {
        exportCanvas('png').then(dataUrl => {
          onCanvasChange(dataUrl);
        });
      }, 10);
    }
  };

  // Undo last stroke
  const undo = () => {
    setPaths(prev => {
      const newPaths = prev.slice(0, -1);
      if (onCanvasChange) {
        setTimeout(() => {
          exportCanvas('png').then(dataUrl => {
            onCanvasChange(dataUrl);
          });
        }, 10);
      }
      return newPaths;
    });
  };

  // Export canvas as image
  const exportCanvas = async (format = 'png') => {
    const svg = svgRef.current;
    if (!svg) return '';
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    
    // Draw background if provided
    if (backgroundImageUrl) {
      const img = new Image();
      img.src = backgroundImageUrl;
      await new Promise(resolve => {
        img.onload = resolve;
      });
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    
    // Convert SVG to image
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.src = url;
    
    return new Promise(resolve => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL(`image/${format}`));
      };
    });
  };

  // Render current stroke in real-time
  useEffect(() => {
    if (!isDrawing || currentPath.length < 2 || isErasing) return;
    
    const svg = svgRef.current;
    let tempPath = svg.querySelector('#temp-path');
    
    if (!tempPath) {
      tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.id = 'temp-path';
      tempPath.style.fill = strokeColor;
      tempPath.style.opacity = '0.8';
      svg.appendChild(tempPath);
    }
    
    const stroke = getStroke(currentPath, strokeOptions);
    const pathData = getSvgPathFromStroke(stroke);
    tempPath.setAttribute('d', pathData);
    tempPath.style.fill = strokeColor;
  }, [currentPath, isDrawing, strokeColor, strokeOptions, isErasing]);

  // Handle tool changes
  useEffect(() => {
    setIsErasing(currentTool === 'eraser');
  }, [currentTool]);

  return (
    <div 
      className={`${styles.canvasContainer} ${styles[`${currentTool}Mode`]}`}
      style={{ width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas 
        ref={canvasRef}
        width={width}
        height={height}
        className={styles.canvas}
        style={{ touchAction: 'none' }}
      />
      
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={styles.svg}
        style={{ pointerEvents: 'none' }}
      >
        {/* Background pattern */}
        {backgroundImageUrl && (
          <defs>
            <pattern id="background" patternUnits="userSpaceOnUse" width={width} height={height}>
              <image href={backgroundImageUrl} x="0" y="0" width={width} height={height} />
            </pattern>
          </defs>
        )}
        
        {backgroundImageUrl && (
          <rect width={width} height={height} fill="url(#background)" />
        )}
        
        {/* Rendered paths */}
        {paths.map((pathObj, index) => (
          <path
            key={index}
            d={pathObj.pathData}
            fill={pathObj.color}
            style={{ opacity: 1 }}
          />
        ))}
      </svg>
      
      {/* Eraser cursor */}
      {isErasing && isDrawing && (
        <div 
          className={styles.eraserCursor}
          style={{
            width: eraserWidth * 2,
            height: eraserWidth * 2,
            left: -eraserWidth,
            top: -eraserWidth,
          }}
        />
      )}
    </div>
  );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;