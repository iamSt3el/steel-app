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
    const [eraserPosition, setEraserPosition] = useState({ x: 0, y: 0 });
    const [showEraser, setShowEraser] = useState(false);
    const activePointerRef = useRef(null);
    const startTimeRef = useRef(null);
    const frameRequestRef = useRef(null);
    
    // Track paths with stable IDs instead of array indices
    const [nextPathId, setNextPathId] = useState(0);
    const [pathsToErase, setPathsToErase] = useState(new Set());
    
    // Simple bounding boxes cache using path IDs
    const pathBBoxes = useRef(new Map());
    
    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;

    // Stroke options
    const strokeOptions = React.useMemo(() => {
        const baseOptions = {
            size: strokeWidth,
            smoothing: 0.5,
            streamline: 0.5,
            easing: (t) => t,
            start: { 
                taper: strokeWidth * 0.5,  // Smooth start taper
                cap: true 
            },
            end: { 
                taper: strokeWidth * 2,    // Much longer end taper for smooth endings
                cap: true 
            }
        };

        if (inputType === 'pen') {
            return {
                ...baseOptions,
                thinning: 0.3,        // Less thinning for more consistent line
                simulatePressure: false,
                smoothing: 0.7,       // More smoothing for pen
                streamline: 0.6,      // Higher streamline for smoother curves
                start: { 
                    taper: strokeWidth * 0.3,  // Moderate start taper
                    cap: true 
                },
                end: { 
                    taper: strokeWidth * 2.5,  // Longer end taper
                    cap: true 
                }
            };
        } else {
            return {
                ...baseOptions,
                thinning: 0.4,        // Moderate thinning
                simulatePressure: true,
                smoothing: 0.6,       // Good smoothing
                streamline: 0.5,      // Balanced streamline
                start: { 
                    taper: strokeWidth * 0.5, 
                    cap: true 
                },
                end: { 
                    taper: strokeWidth * 2,    // Longer end taper
                    cap: true 
                }
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

    // Get SVG path from stroke
    const getSvgPathFromStroke = useCallback((stroke) => {
        if (!stroke.length) return '';

        const d = [];
        const [first, ...rest] = stroke;
        d.push('M', first[0].toFixed(2), first[1].toFixed(2));

        for (const [x, y] of rest) {
            d.push('L', x.toFixed(2), y.toFixed(2));
        }

        d.push('Z');
        return d.join(' ');
    }, []);

    // Add gradual pressure reduction points for smooth endings
    const createSmoothEnding = useCallback((points) => {
        if (points.length < 2) return points;
        
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2] || lastPoint;
        
        // Create tapering points
        const smoothPoints = [...points];
        const taperSteps = Math.min(3, strokeWidth / 2); // More taper steps for thicker strokes
        
        for (let i = 1; i <= taperSteps; i++) {
            const t = i / (taperSteps + 1);
            const pressure = lastPoint[2] * (1 - t * 0.8); // Gradually reduce pressure
            const x = lastPoint[0];
            const y = lastPoint[1];
            smoothPoints.push([x, y, Math.max(0.1, pressure)]);
        }
        
        return smoothPoints;
    }, [strokeWidth]);

    // Get point from event with better pressure handling
    const getPointFromEvent = useCallback((e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const type = e.pointerType || 'mouse';
        if (type !== inputType) {
            setInputType(type);
        }

        const x = (e.clientX - rect.left) / rect.width * width;
        const y = (e.clientY - rect.top) / rect.height * height;
        
        let pressure = 0.5;
        
        if (type === 'pen') {
            // Use natural pen pressure with smoothing
            pressure = e.pressure || 0.5;
            // Clamp pressure to a reasonable range
            pressure = Math.max(0.2, Math.min(0.9, pressure));
        } else if (type === 'touch') {
            // Consistent pressure for touch
            pressure = 0.6;
        } else {
            // For mouse, use velocity-based pressure but start with full pressure
            pressure = 0.8; // Start with higher pressure for mouse
        }

        return [x, y, pressure];
    }, [width, height, inputType]);

    // Calculate simple bounding box from SVG path
    const calculateBoundingBox = useCallback((pathData) => {
        const coords = pathData.match(/(-?\d+(?:\.\d+)?)/g);
        if (!coords || coords.length < 4) {
            return null;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (let i = 0; i < coords.length - 1; i += 2) {
            const x = parseFloat(coords[i]);
            const y = parseFloat(coords[i + 1]);
            
            if (!isNaN(x) && !isNaN(y)) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }, []);

    // Check if eraser circle intersects with path bounding box
    const eraserIntersectsBoundingBox = useCallback((eraserX, eraserY, eraserRadius, bbox) => {
        // Expand bounding box by eraser radius
        const expandedBbox = {
            x: bbox.x - eraserRadius,
            y: bbox.y - eraserRadius,
            width: bbox.width + 2 * eraserRadius,
            height: bbox.height + 2 * eraserRadius
        };

        // Check if eraser center is inside expanded bounding box
        return eraserX >= expandedBbox.x && 
               eraserX <= expandedBbox.x + expandedBbox.width &&
               eraserY >= expandedBbox.y && 
               eraserY <= expandedBbox.y + expandedBbox.height;
    }, []);

    // Handle erasing - mark paths for deletion if they intersect with eraser
    const handleErase = useCallback((x, y) => {
        const eraserRadius = eraserWidth / 2;
        
        setPathsToErase(prev => {
            const newPathsToErase = new Set(prev); // Start with existing marked paths
            
            for (let i = 0; i < paths.length; i++) {
                const pathObj = paths[i];
                // Skip if already marked for erasure
                if (newPathsToErase.has(pathObj.id)) continue;
                
                if (pathObj.type === 'stroke' && pathObj.pathData) {
                    // Get or calculate bounding box using path ID
                    let bbox = pathBBoxes.current.get(pathObj.id);
                    if (!bbox) {
                        bbox = calculateBoundingBox(pathObj.pathData);
                        if (bbox) {
                            pathBBoxes.current.set(pathObj.id, bbox);
                        }
                    }
                    
                    // Check if eraser intersects with path
                    if (bbox && eraserIntersectsBoundingBox(x, y, eraserRadius, bbox)) {
                        newPathsToErase.add(pathObj.id);
                    }
                }
            }
            
            return newPathsToErase;
        });
    }, [paths, eraserWidth, calculateBoundingBox, eraserIntersectsBoundingBox]);

    // Handle mouse enter/leave for eraser visibility
    const handleMouseEnter = useCallback(() => {
        if (currentTool === 'eraser') {
            setShowEraser(true);
        }
    }, [currentTool]);

    const handleMouseLeave = useCallback(() => {
        setShowEraser(false);
        // Keep faded paths visible until they're actually erased
    }, []);

    // Pointer down handler
    const handlePointerDown = useCallback((e) => {
        if (!canvasRef.current || !e.isPrimary) return;

        setIsDrawing(true);
        activePointerRef.current = e.pointerId;
        e.preventDefault();

        if (canvasRef.current.setPointerCapture) {
            canvasRef.current.setPointerCapture(e.pointerId);
        }

        const point = getPointFromEvent(e);
        lastPointRef.current = point;

        if (isErasing) {
            // Clear any previously marked paths
            setPathsToErase(new Set());
            handleErase(point[0], point[1]);
        } else {
            setCurrentPath([point]);

            // Create temp path and draw initial dot/stroke immediately
            const svg = svgRef.current;
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.id = 'temp-path';
            tempPath.setAttribute('fill', strokeColor);
            tempPath.setAttribute('stroke', 'none');
            
            // Create an initial stroke from just the first point
            try {
                const stroke = getStroke([point], strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);
                tempPath.setAttribute('d', pathData);
            } catch (error) {
                // Fallback: create a simple circle if getStroke fails with single point
                const radius = strokeWidth / 2;
                const pathData = `M ${point[0] - radius},${point[1]} 
                                 A ${radius},${radius} 0 1,1 ${point[0] + radius},${point[1]} 
                                 A ${radius},${radius} 0 1,1 ${point[0] - radius},${point[1]} Z`;
                tempPath.setAttribute('d', pathData);
            }
            
            svg.appendChild(tempPath);
        }
    }, [isErasing, getPointFromEvent, strokeColor, handleErase, strokeOptions, getSvgPathFromStroke, strokeWidth]);

    // Pointer move handler
    const handlePointerMove = useCallback((e) => {
        if (!canvasRef.current) return;

        // Update eraser position
        if (currentTool === 'eraser') {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setEraserPosition({ x, y });
            setShowEraser(true);
        }

        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        e.preventDefault();
        const point = getPointFromEvent(e);

        if (isErasing) {
            // For erasing, process immediately without throttling
            handleErase(point[0], point[1]);
        } else {
            // For drawing, use requestAnimationFrame to smooth the drawing
            if (frameRequestRef.current) {
                cancelAnimationFrame(frameRequestRef.current);
            }
            
            frameRequestRef.current = requestAnimationFrame(() => {
                setCurrentPath(prev => {
                    const newPath = [...prev, point];

                    // Update temp path
                    const svg = svgRef.current;
                    const tempPath = svg?.querySelector('#temp-path');

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
                
                frameRequestRef.current = null;
            });
        }

        lastPointRef.current = point;
    }, [currentTool, isDrawing, isErasing, getPointFromEvent, handleErase, strokeOptions, getSvgPathFromStroke]);

    // Pointer up handler - actually delete marked paths
    const handlePointerUp = useCallback((e) => {
        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        setIsDrawing(false);
        activePointerRef.current = null;

        if (canvasRef.current?.releasePointerCapture) {
            canvasRef.current.releasePointerCapture(e.pointerId);
        }

        if (isErasing) {
            // Actually delete the marked paths
            if (pathsToErase.size > 0) {
                setPaths(prev => {
                    const newPaths = prev.filter(path => !pathsToErase.has(path.id));
                    
                    // Clear bounding box cache for deleted paths
                    pathsToErase.forEach(pathId => {
                        pathBBoxes.current.delete(pathId);
                    });
                    
                    return newPaths;
                });
                
                // Notify parent
                if (onCanvasChange) {
                    setTimeout(() => {
                        exportCanvas('png').then(dataUrl => {
                            onCanvasChange(dataUrl);
                        });
                    }, 10);
                }
            }
            
            // Clear marked paths
            setPathsToErase(new Set());
        } else if (currentPath.length > 0) {
            try {
                // Add smooth ending to the stroke
                const finalPoint = getPointFromEvent(e);
                const finalPath = [...currentPath, finalPoint];
                const smoothedPath = createSmoothEnding(finalPath);
                
                const stroke = getStroke(smoothedPath, strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);

                // Remove temp path
                const svg = svgRef.current;
                const tempPath = svg?.querySelector('#temp-path');
                if (tempPath) {
                    tempPath.remove();
                }

                // Add to paths with a stable ID
                setPaths(prev => {
                    const newPath = {
                        id: nextPathId,
                        pathData,
                        color: strokeColor,
                        type: 'stroke',
                        inputType: inputType,
                        strokeWidth: strokeWidth
                    };
                    
                    // Calculate bounding box for new path using its ID
                    const bbox = calculateBoundingBox(pathData);
                    if (bbox) {
                        pathBBoxes.current.set(nextPathId, bbox);
                    }
                    
                    return [...prev, newPath];
                });

                // Increment the path ID counter
                setNextPathId(prev => prev + 1);
                setCurrentPath([]);

                // Notify parent
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
    }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, getSvgPathFromStroke, inputType, strokeWidth, onCanvasChange, pathsToErase, calculateBoundingBox, createSmoothEnding, getPointFromEvent, nextPathId]);

    // Clear canvas
    const clearCanvas = useCallback(() => {
        setPaths([]);
        setCurrentPath([]);
        setPathsToErase(new Set());
        pathBBoxes.current.clear();

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
            if (prev.length === 0) return prev;
            
            const newPaths = prev.slice(0, -1);
            // Remove the bounding box for the last path
            const lastPath = prev[prev.length - 1];
            if (lastPath && lastPath.id !== undefined) {
                pathBBoxes.current.delete(lastPath.id);
            }
            
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

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Convert SVG to image
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        return new Promise(resolve => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL(`image/${format}`, 0.98));
            };
            img.src = url;
        });
    }, [width, height, dpr]);

    // Handle tool changes
    useEffect(() => {
        const newIsErasing = currentTool === 'eraser';
        setIsErasing(newIsErasing);
        
        if (!newIsErasing) {
            setPathsToErase(new Set());
        }
    }, [currentTool]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (frameRequestRef.current) {
                cancelAnimationFrame(frameRequestRef.current);
            }
        };
    }, []);

    return (
        <div
            className={`${styles.canvasContainer} ${styles[`${currentTool}Mode`]}`}
            style={{ width, height }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
                    shapeRendering: 'geometricPrecision'
                }}
            >
                {/* Rendered paths */}
                {paths.map((pathObj) => (
                    <path
                        key={pathObj.id}
                        d={pathObj.pathData}
                        fill={pathObj.color}
                        stroke="none"
                        fillRule="nonzero"
                        style={{
                            opacity: pathsToErase.has(pathObj.id) ? 0.3 : 1,
                            transition: 'opacity 0.1s ease'
                        }}
                    />
                ))}
            </svg>

            {/* Eraser cursor */}
            {currentTool === 'eraser' && showEraser && (
                <div
                    className={styles.eraserCursor}
                    style={{
                        width: eraserWidth * 2,
                        height: eraserWidth * 2,
                        left: eraserPosition.x - eraserWidth,
                        top: eraserPosition.y - eraserWidth,
                        position: 'absolute',
                        border: '2px solid #ef4444',
                        borderRadius: '50%',
                        pointerEvents: 'none',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)'
                    }}
                />
            )}
        </div>
    );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;