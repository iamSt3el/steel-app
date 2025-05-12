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
  const activePointerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Get device pixel ratio for crisp rendering
  const dpr = window.devicePixelRatio || 1;

  // Enhanced stroke options with better pen responsiveness
  const strokeOptions = React.useMemo(() => {
    const baseOptions = {
      size: strokeWidth,
      smoothing: 0.95,      // Increased for even smoother lines
      streamline: 0.5,      // Reduced for better responsiveness
      easing: (t) => Math.sin((t * Math.PI) / 2), // Smooth sine ease
      start: {
        taper: 0,
        cap: true
      },
      end: {
        taper: strokeWidth * 0.5,
        cap: true
      }
    };

    if (inputType === 'pen') {
      return {
        ...baseOptions,
        thinning: 0.3,        // Reduced for better pen response
        simulatePressure: false,
        streamline: 0.3,      // Lower streamline for immediate response
        smoothing: 0.85,      // Slightly less smoothing for pen
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

  // Enhanced SVG path generation with better precision
  const getSvgPathFromStroke = useCallback((stroke) => {
    if (!stroke.length) return '';

    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        if (i === 0) {
          acc.push('M', x0.toFixed(2), y0.toFixed(2));
        } else {
          const [x1, y1] = arr[(i + 1) % arr.length];
          const cpx = ((x0 + x1) / 2).toFixed(2);
          const cpy = ((y0 + y1) / 2).toFixed(2);
          acc.push('Q', x0.toFixed(2), y0.toFixed(2), cpx, cpy);
        }
        return acc;
      },
      []
    );

    d.push('Z');
    return d.join(' ');
  }, []);

  // Enhanced point extraction with high precision
  const getPointFromEvent = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Set input type with priority for pen
    if (e.pointerType === 'pen') {
      setInputType('pen');
    } else if (e.pointerType === 'touch') {
      setInputType('touch');
    } else {
      setInputType('mouse');
    }
    
    // Get high-precision coordinates
    const x = (e.clientX - rect.left) / rect.width * width;
    const y = (e.clientY - rect.top) / rect.height * height;
    
    // Enhanced pressure handling
    let pressure = 0.5;
    if (e.pointerType === 'pen') {
      // Use raw pressure for pen input
      pressure = e.pressure || 0.5;
      // Normalize pressure range for better control
      pressure = Math.max(0.1, Math.min(1, pressure));
    } else if (e.pointerType === 'touch') {
      // Constant pressure for touch
      pressure = 0.7;
    }
    
    return [x, y, pressure, e.timeStamp || Date.now()];
  }, [width, height]);

  // Enhanced speed-to-pressure calculation for mouse
  const calculateSpeedPressure = useCallback((currentPoint, lastPoint) => {
    if (!lastPoint || inputType !== 'mouse') return currentPoint[2];
    
    const [x1, y1, , t1] = currentPoint;
    const [x2, y2, lastPressure, t2] = lastPoint;
    
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const timeDistance = Math.max(1, t1 - t2);
    const speed = distance / timeDistance;
    
    // Better speed-to-pressure mapping
    const maxSpeed = 1.5; // Adjusted for better sensitivity
    const speedPressure = Math.max(0.1, Math.min(1, 1 - speed / maxSpeed));
    
    // Smoother pressure transitions for mouse
    const smoothingFactor = 0.3;
    return lastPressure * (1 - smoothingFactor) + speedPressure * smoothingFactor;
  }, [inputType]);

  // Handle pointer down with better event handling
  const handlePointerDown = useCallback((e) => {
    if (!canvasRef.current || !e.isPrimary) return;
    
    // Store active pointer ID for multi-touch support
    activePointerRef.current = e.pointerId;
    setIsDrawing(true);
    e.preventDefault();
    e.stopPropagation();
    
    // Capture the pointer for better tracking
    if (canvasRef.current.setPointerCapture) {
      canvasRef.current.setPointerCapture(e.pointerId);
    }
    
    const point = getPointFromEvent(e);
    lastPointRef.current = point;
    startTimeRef.current = point[3];
    
    if (isErasing) {
      handleErase(point[0], point[1]);
    } else {
      setCurrentPath([point]);
      
      // Create immediate visual feedback
      const svg = svgRef.current;
      const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.id = 'temp-path';
      tempPath.style.fill = strokeColor;
      tempPath.style.opacity = '0.9';
      tempPath.style.fillRule = 'nonzero';
      
      // Add initial point as a small circle for immediate feedback
      const initialStroke = getStroke([point, point], strokeOptions);
      const pathData = getSvgPathFromStroke(initialStroke);
      tempPath.setAttribute('d', pathData);
      
      svg.appendChild(tempPath);
    }
  }, [isErasing, getPointFromEvent, strokeColor, strokeOptions, getSvgPathFromStroke]);

  // Enhanced pointer move handler with better performance
  const handlePointerMove = useCallback((e) => {
    if (!isDrawing || !canvasRef.current || e.pointerId !== activePointerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
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
        
        // Update temp path every frame for maximum responsiveness
        const svg = svgRef.current;
        const tempPath = svg.querySelector('#temp-path');
        
        if (tempPath && newPath.length > 1) {
          try {
            const stroke = getStroke(newPath, strokeOptions);
            const pathData = getSvgPathFromStroke(stroke);
            tempPath.setAttribute('d', pathData);
          } catch (error) {
            console.warn('Error updating path:', error);
          }
        }
        
        return newPath;
      });
    }
    
    lastPointRef.current = point;
  }, [isDrawing, isErasing, getPointFromEvent, strokeOptions, getSvgPathFromStroke, inputType, calculateSpeedPressure]);

  // Handle pointer up with cleanup
  const handlePointerUp = useCallback((e) => {
    if (!isDrawing || e.pointerId !== activePointerRef.current) return;
    
    setIsDrawing(false);
    activePointerRef.current = null;
    
    // Release pointer capture
    if (canvasRef.current.releasePointerCapture) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    
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

  // Enhanced erasing with better collision detection
  const handleErase = useCallback((x, y) => {
    setPaths(prev => {
      return prev.filter(pathObj => {
        if (pathObj.type === 'stroke') {
          const svg = svgRef.current;
          if (!svg) return true;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathObj.pathData);
          
          // Check multiple points around the eraser position
          const checkPoints = [
            [x, y],
            [x - eraserWidth, y],
            [x + eraserWidth, y],
            [x, y - eraserWidth],
            [x, y + eraserWidth]
          ];
          
          return !checkPoints.some(([px, py]) => {
            const point = svg.createSVGPoint();
            point.x = px;
            point.y = py;
            return path.isPointInFill(point);
          });
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
          touchAction: 'pan-x pan-y',  // Changed for better pen support
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
            fillRule="nonzero"
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