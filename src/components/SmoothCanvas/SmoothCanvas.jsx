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
  const lastPointRef = useRef(null);
  const [inputType, setInputType] = useState('mouse');

  // Get device pixel ratio for crisp rendering
  const dpr = window.devicePixelRatio || 1;

  // Optimized stroke options for smoothness
  const strokeOptions = React.useMemo(() => {
    const baseOptions = {
      size: strokeWidth,
      smoothing: 0.9,      // Increased for smoother lines
      streamline: 0.7,     // Increased to reduce jitter
      easing: (t) => t * t * (3 - 2 * t), // Smooth ease in-out
      start: {
        taper: 0,
        cap: true
      },
      end: {
        taper: 5,
        cap: true
      }
    };

    if (inputType === 'pen') {
      return {
        ...baseOptions,
        thinning: 0.4,
        simulatePressure: false,
      };
    } else {
      return {
        ...baseOptions,
        thinning: 0.6,
        simulatePressure: true,
      };
    }
  }, [strokeWidth, inputType]);

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

  // Back to the working SVG path generation (with nonzero fill rule fix)
  const getSvgPathFromStroke = useCallback((stroke) => {
    if (!stroke.length) return '';

    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        if (i === 0) {
          acc.push('M', x0, y0);
        } else {
          const [x1, y1] = arr[(i + 1) % arr.length];
          acc.push('Q', x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        }
        return acc;
      },
      []
    );

    d.push('Z');
    return d.join(' ');
  }, []);

  // Improved point extraction with smoothing
  const getPointFromEvent = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Detect input type
    if (e.pointerType === 'pen') {
      setInputType('pen');
    } else if (e.pointerType === 'touch') {
      setInputType('touch');
    } else {
      setInputType('mouse');
    }
    
    // Get coordinates with sub-pixel precision
    const x = (e.clientX - rect.left) * dpr / dpr;
    const y = (e.clientY - rect.top) * dpr / dpr;
    
    // Handle pressure
    let pressure = 0.5;
    if (e.pointerType === 'pen' && typeof e.pressure === 'number') {
      pressure = Math.max(0.1, Math.min(1, e.pressure));
    } else if (e.pointerType === 'touch') {
      pressure = 0.7;
    }
    
    return [x, y, pressure, Date.now()];
  }, [dpr]);

  // Enhanced speed-to-pressure calculation
  const calculateSpeedPressure = useCallback((currentPoint, lastPoint) => {
    if (!lastPoint || inputType !== 'mouse') return currentPoint[2];
    
    const [x1, y1, , t1] = currentPoint;
    const [x2, y2, , t2] = lastPoint;
    
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const timeDistance = Math.max(1, t1 - t2);
    const speed = distance / timeDistance;
    
    // Adjust for more natural pressure variation
    const maxSpeed = 2;
    const speedPressure = Math.max(0.2, Math.min(0.9, 1 - speed / maxSpeed));
    
    // Heavy smoothing for mouse input
    const smoothingFactor = 0.1;
    const smoothedPressure = lastPoint[2] * (1 - smoothingFactor) + speedPressure * smoothingFactor;
    
    return smoothedPressure;
  }, [inputType]);

  // Handle pointer down
  const handlePointerDown = useCallback((e) => {
    if (!canvasRef.current) return;
    
    setIsDrawing(true);
    e.preventDefault();
    
    const point = getPointFromEvent(e);
    lastPointRef.current = point;
    
    if (isErasing) {
      handleErase(point[0], point[1]);
    } else {
      setCurrentPath([point]);
      
      // Create a more precise initial stroke for very small movements
      const svg = svgRef.current;
      const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.id = 'temp-path';
      tempPath.style.fill = strokeColor;
      tempPath.style.opacity = '0.9';
      tempPath.style.fillRule = 'nonzero'; // Set nonzero fill rule
      svg.appendChild(tempPath);
    }
  }, [isErasing, getPointFromEvent, strokeColor]);

  // Optimized pointer move handler
  const handlePointerMove = useCallback((e) => {
    if (!isDrawing || !canvasRef.current) return;
    
    e.preventDefault();
    const point = getPointFromEvent(e);
    
    if (isErasing) {
      handleErase(point[0], point[1]);
    } else {
      // Calculate pressure for mouse
      if (inputType === 'mouse' && lastPointRef.current) {
        point[2] = calculateSpeedPressure(point, lastPointRef.current);
      }
      
      setCurrentPath(prev => {
        const newPath = [...prev, point];
        
        // Update temp path with better performance
        if (newPath.length > 1) {
          const svg = svgRef.current;
          const tempPath = svg.querySelector('#temp-path');
          
          if (tempPath) {
            // Only update every 2nd point for better performance while maintaining smoothness
            if (newPath.length % 2 === 0) {
              try {
                const stroke = getStroke(newPath, strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);
                tempPath.setAttribute('d', pathData);
                tempPath.style.fillRule = 'nonzero'; // Ensure nonzero fill rule
              } catch (error) {
                console.warn('Error updating path:', error);
              }
            }
          }
        }
        
        return newPath;
      });
    }
    
    lastPointRef.current = point;
  }, [isDrawing, isErasing, getPointFromEvent, strokeOptions, getSvgPathFromStroke, inputType, calculateSpeedPressure]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    
    if (!isErasing && currentPath.length > 0) {
      // Create final stroke with full precision
      try {
        const stroke = getStroke(currentPath, strokeOptions);
        const pathData = getSvgPathFromStroke(stroke);
        
        // Remove temp path
        const svg = svgRef.current;
        const tempPath = svg.querySelector('#temp-path');
        if (tempPath) {
          tempPath.remove();
        }
        
        // Add final path to collection
        setPaths(prev => [...prev, {
          pathData,
          color: strokeColor,
          type: 'stroke',
          inputType: inputType,
          strokeWidth: strokeWidth
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
      } catch (error) {
        console.error('Error finalizing stroke:', error);
      }
    }
    
    lastPointRef.current = null;
  }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, getSvgPathFromStroke, inputType, strokeWidth, onCanvasChange]);

  // Handle erasing
  const handleErase = useCallback((x, y) => {
    setPaths(prev => {
      return prev.filter(pathObj => {
        if (pathObj.type === 'stroke') {
          const svg = svgRef.current;
          if (!svg) return true;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathObj.pathData);
          
          const bbox = path.getBBox();
          
          // Quick bounding box check
          if (x < bbox.x - eraserWidth || 
              x > bbox.x + bbox.width + eraserWidth ||
              y < bbox.y - eraserWidth || 
              y > bbox.y + bbox.height + eraserWidth) {
            return true;
          }
          
          return false;
        }
        return true;
      });
    });
  }, [eraserWidth]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    setPaths([]);
    setCurrentPath([]);
    const svg = svgRef.current;
    const tempPath = svg?.querySelector('#temp-path');
    if (tempPath) tempPath.remove();
    
    if (onCanvasChange) {
      setTimeout(() => {
        exportCanvas('png').then(dataUrl => {
          onCanvasChange(dataUrl);
        });
      }, 10);
    }
  }, [onCanvasChange]);

  // Undo last stroke
  const undo = useCallback(() => {
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
  }, [onCanvasChange]);

  // Export canvas as image
  const exportCanvas = useCallback(async (format = 'png') => {
    const svg = svgRef.current;
    if (!svg) return '';
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Use higher resolution for export
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    // Draw background
    if (backgroundImageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise(resolve => {
        img.onload = resolve;
        img.src = backgroundImageUrl;
      });
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    
    // Convert SVG to image with higher quality
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise(resolve => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL(`image/${format}`, 0.95));
      };
      img.src = url;
    });
  }, [width, height, backgroundImageUrl, dpr]);

  // Handle tool changes
  useEffect(() => {
    setIsErasing(currentTool === 'eraser');
  }, [currentTool]);

  // Setup SVG for crisp rendering
  useEffect(() => {
    const svg = svgRef.current;
    if (svg) {
      svg.style.shapeRendering = 'geometricPrecision';
      svg.style.imageRendering = 'crisp-edges';
    }
  }, []);

  return (
    <div 
      className={`${styles.canvasContainer} ${styles[`${currentTool}Mode`]}`}
      style={{ width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <canvas 
        ref={canvasRef}
        width={width * dpr}
        height={height * dpr}
        className={styles.canvas}
        style={{ 
          touchAction: 'none',
          width: `${width}px`,
          height: `${height}px`
        }}
      />
      
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        style={{ 
          pointerEvents: 'none',
          shapeRendering: 'geometricPrecision',
          imageRendering: 'crisp-edges'
        }}
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
            stroke="none"
            fillRule="nonzero"  // Use nonzero fill rule to prevent white holes
          />
        ))}
      </svg>
      
      {/* Eraser cursor */}
      {isErasing && (
        <div 
          className={styles.eraserCursor}
          style={{
            width: eraserWidth * 2,
            height: eraserWidth * 2,
            border: '2px solid #ef4444',
            borderRadius: '50%',
            pointerEvents: 'none',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            animation: 'pulse 1s infinite',
          }}
        />
      )}
    </div>
  );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;