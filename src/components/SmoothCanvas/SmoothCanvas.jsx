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
    
    // Track paths to be erased (showing them faded)
    const [pathsToErase, setPathsToErase] = useState(new Set());
    
    // Simple bounding boxes cache
    const pathBBoxes = useRef(new Map());
    
    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;

    // Stroke options optimized for different input types
    const strokeOptions = React.useMemo(() => {
        const baseOptions = {
            size: strokeWidth,
            smoothing: 0.5,
            streamline: 0.5,
            easing: (t) => t * t,
            start: {
                taper: strokeWidth * 0.25,
                cap: true
            },
            end: {
                taper: strokeWidth * 0.75,
                cap: true
            }
        };

        if (inputType === 'pen') {
            return {
                ...baseOptions,
                thinning: 0.75,
                simulatePressure: false,
                smoothing: 0.4,
                streamline: 0.35,
                easing: (t) => Math.pow(t, 0.6),
                start: {
                    taper: strokeWidth * 0.1,
                    cap: true
                },
                end: {
                    taper: strokeWidth * 0.5,
                    cap: true
                }
            };
        } else if (inputType === 'touch') {
            return {
                ...baseOptions,
                thinning: 0.6,
                simulatePressure: true,
                smoothing: 0.7,
                streamline: 0.6,
            };
        } else {
            return {
                ...baseOptions,
                thinning: 0.7,
                simulatePressure: true,
                smoothing: 0.5,
                streamline: 0.5,
            };
        }
    }, [strokeWidth, inputType]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        eraseMode: (mode) => {
            setIsErasing(mode);
        },
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

    // Optimized SVG path generation
    const getSvgPathFromStroke = useCallback((stroke) => {
        if (!stroke.length) return '';

        const d = [];
        const precision = Math.max(1, Math.floor(stroke.length / 50));

        if (stroke.length < 3) {
            const [x0, y0] = stroke[0];
            const [x1, y1] = stroke[stroke.length - 1];
            d.push('M', x0.toFixed(1), y0.toFixed(1));
            d.push('L', x1.toFixed(1), y1.toFixed(1));
        } else {
            d.push('M', stroke[0][0].toFixed(1), stroke[0][1].toFixed(1));

            for (let i = 1; i < stroke.length - 1; i += precision) {
                const [x0, y0] = stroke[i];
                const [x1, y1] = stroke[Math.min(i + precision, stroke.length - 1)];
                const cpx = ((x0 + x1) / 2).toFixed(1);
                const cpy = ((y0 + y1) / 2).toFixed(1);
                d.push('Q', x0.toFixed(1), y0.toFixed(1), cpx, cpy);
            }

            const [xLast, yLast] = stroke[stroke.length - 1];
            d.push('L', xLast.toFixed(1), yLast.toFixed(1));
        }

        d.push('Z');
        return d.join(' ');
    }, []);

    // Get point from event
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
            pressure = e.pressure || 0.5;
            pressure = Math.pow(pressure, 0.6);
            pressure = Math.max(0.1, Math.min(1, pressure));
        } else if (type === 'touch') {
            pressure = 0.6;
        }

        return [x, y, pressure];
    }, [width, height, inputType]);

    // Simple bounding box calculation from SVG path
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
            const newPathsToErase = new Set(prev);
            
            for (let i = 0; i < paths.length; i++) {
                // Skip if already marked for erasure
                if (newPathsToErase.has(i)) continue;
                
                const pathObj = paths[i];
                if (pathObj.type === 'stroke' && pathObj.pathData) {
                    // Get or calculate bounding box
                    let bbox = pathBBoxes.current.get(i);
                    if (!bbox) {
                        bbox = calculateBoundingBox(pathObj.pathData);
                        if (bbox) {
                            pathBBoxes.current.set(i, bbox);
                        }
                    }
                    
                    // Check if eraser intersects with path
                    if (bbox && eraserIntersectsBoundingBox(x, y, eraserRadius, bbox)) {
                        newPathsToErase.add(i);
                    }
                }
            }
            
            return newPathsToErase;
        });
    }, [paths, eraserWidth, calculateBoundingBox, eraserIntersectsBoundingBox]);

    // Enhanced speed-based pressure for mouse
    const calculateSpeedPressure = useCallback((currentPoint, lastPoint) => {
        if (!lastPoint || inputType !== 'mouse') return currentPoint[2];

        const [x1, y1] = currentPoint;
        const [x2, y2] = lastPoint;
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

        let pressure;
        if (distance < 2) {
            pressure = 0.9;
        } else if (distance > 30) {
            pressure = 0.1;
        } else {
            const normalizedSpeed = (distance - 2) / 28;
            pressure = 0.9 - (normalizedSpeed * normalizedSpeed * 0.8);
        }

        const lastPressure = lastPoint[2] || 0.5;
        return lastPressure * 0.4 + pressure * 0.6;
    }, [inputType]);

    // Handle mouse enter/leave for eraser visibility
    const handleMouseEnter = useCallback(() => {
        if (currentTool === 'eraser') {
            setShowEraser(true);
        }
    }, [currentTool]);

    const handleMouseLeave = useCallback(() => {
        setShowEraser(false);
        setPathsToErase(new Set());
    }, []);

    // Pointer down handler
    const handlePointerDown = useCallback((e) => {
        if (!canvasRef.current || !e.isPrimary) return;

        setIsDrawing(true);
        activePointerRef.current = e.pointerId;
        e.preventDefault();
        e.stopPropagation();

        if (canvasRef.current.setPointerCapture) {
            canvasRef.current.setPointerCapture(e.pointerId);
        }

        const point = getPointFromEvent(e);
        lastPointRef.current = point;

        if (isErasing) {
            setPathsToErase(new Set());
            handleErase(point[0], point[1]);
        } else {
            setCurrentPath([point]);

            // Create initial path
            const svg = svgRef.current;
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.id = 'temp-path';
            tempPath.setAttribute('fill', strokeColor);
            tempPath.setAttribute('stroke', 'none');
            tempPath.setAttribute('fill-rule', 'nonzero');
            svg.appendChild(tempPath);
        }
    }, [isErasing, getPointFromEvent, strokeColor, handleErase]);

    // Pointer move handler
    const handlePointerMove = useCallback((e) => {
        if (!canvasRef.current) return;

        // Always update eraser position
        if (currentTool === 'eraser') {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setEraserPosition({ x, y });
            setShowEraser(true);
        }

        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        e.preventDefault();
        e.stopPropagation();

        if (frameRequestRef.current) {
            cancelAnimationFrame(frameRequestRef.current);
        }

        frameRequestRef.current = requestAnimationFrame(() => {
            const point = getPointFromEvent(e);

            if (isErasing) {
                handleErase(point[0], point[1]);
            } else {
                // Drawing mode
                if (inputType === 'mouse' && lastPointRef.current) {
                    point[2] = calculateSpeedPressure(point, lastPointRef.current);
                }

                setCurrentPath(prev => {
                    const newPath = [...prev, point];

                    // Update temp path
                    if (newPath.length > 1) {
                        const svg = svgRef.current;
                        const tempPath = svg?.querySelector('#temp-path');

                        if (tempPath) {
                            try {
                                const stroke = getStroke(newPath, strokeOptions);
                                const pathData = getSvgPathFromStroke(stroke);
                                tempPath.setAttribute('d', pathData);
                            } catch (error) {
                                console.warn('Error updating path:', error);
                            }
                        }
                    }

                    return newPath;
                });
            }

            lastPointRef.current = point;
        });
    }, [currentTool, isDrawing, isErasing, getPointFromEvent, strokeOptions, getSvgPathFromStroke, inputType, calculateSpeedPressure, handleErase]);

    // Pointer up handler - actually delete marked paths
    const handlePointerUp = useCallback((e) => {
        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        setIsDrawing(false);
        activePointerRef.current = null;

        if (frameRequestRef.current) {
            cancelAnimationFrame(frameRequestRef.current);
            frameRequestRef.current = null;
        }

        if (canvasRef.current?.releasePointerCapture) {
            canvasRef.current.releasePointerCapture(e.pointerId);
        }

        if (isErasing) {
            // Actually delete the marked paths
            if (pathsToErase.size > 0) {
                setPaths(prev => {
                    const newPaths = prev.filter((_, index) => !pathsToErase.has(index));
                    
                    // Clear bounding box cache for deleted paths
                    pathsToErase.forEach(index => {
                        pathBBoxes.current.delete(index);
                    });
                    
                    // Rebuild bounding box map with new indices
                    const newBBoxMap = new Map();
                    newPaths.forEach((path, newIndex) => {
                        const originalIndex = prev.findIndex(p => p === path);
                        if (originalIndex !== -1 && pathBBoxes.current.has(originalIndex)) {
                            newBBoxMap.set(newIndex, pathBBoxes.current.get(originalIndex));
                        }
                    });
                    pathBBoxes.current = newBBoxMap;
                    
                    return newPaths;
                });
                
                // Notify parent of change
                if (onCanvasChange) {
                    setTimeout(() => {
                        exportCanvas('png').then(dataUrl => {
                            onCanvasChange(dataUrl);
                        });
                    }, 16);
                }
            }
            
            // Clear marked paths
            setPathsToErase(new Set());
        } else if (currentPath.length > 0) {
            try {
                const finalPoint = getPointFromEvent(e);
                const finalPath = [...currentPath, finalPoint];

                const stroke = getStroke(finalPath, strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);

                // Remove temp path
                const svg = svgRef.current;
                const tempPath = svg?.querySelector('#temp-path');
                if (tempPath) {
                    tempPath.remove();
                }

                // Add to paths
                setPaths(prev => {
                    const newPaths = [...prev, {
                        pathData,
                        color: strokeColor,
                        type: 'stroke',
                        inputType: inputType,
                        strokeWidth: strokeWidth
                    }];
                    
                    // Calculate bounding box for new path
                    const newIndex = newPaths.length - 1;
                    const bbox = calculateBoundingBox(pathData);
                    if (bbox) {
                        pathBBoxes.current.set(newIndex, bbox);
                    }
                    
                    return newPaths;
                });

                setCurrentPath([]);

                // Notify parent
                if (onCanvasChange) {
                    setTimeout(() => {
                        exportCanvas('png').then(dataUrl => {
                            onCanvasChange(dataUrl);
                        });
                    }, 16);
                }
            } catch (error) {
                console.error('Error finalizing stroke:', error);
            }
        }

        lastPointRef.current = null;
    }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, getSvgPathFromStroke, inputType, strokeWidth, onCanvasChange, getPointFromEvent, calculateBoundingBox, pathsToErase]);

    // Clear canvas
    const clearCanvas = useCallback(() => {
        setPaths([]);
        setCurrentPath([]);
        pathBBoxes.current.clear();
        setPathsToErase(new Set());

        const svg = svgRef.current;
        const tempPath = svg?.querySelector('#temp-path');
        if (tempPath) tempPath.remove();

        if (onCanvasChange) {
            setTimeout(() => {
                exportCanvas('png').then(dataUrl => {
                    onCanvasChange(dataUrl);
                });
            }, 16);
        }
    }, [onCanvasChange]);

    // Undo last stroke
    const undo = useCallback(() => {
        setPaths(prev => {
            if (prev.length === 0) return prev;
            
            const newPaths = prev.slice(0, -1);
            pathBBoxes.current.delete(prev.length - 1);
            
            if (onCanvasChange) {
                setTimeout(() => {
                    exportCanvas('png').then(dataUrl => {
                        onCanvasChange(dataUrl);
                    });
                }, 16);
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
    }, [width, height, backgroundImageUrl, dpr]);

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
            pathBBoxes.current.clear();
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
                        style={{
                            opacity: pathsToErase.has(index) ? 0.3 : 1,
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
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        transform: 'translateZ(0)',
                    }}
                />
            )}
        </div>
    );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;