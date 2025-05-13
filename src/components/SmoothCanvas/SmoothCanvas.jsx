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
    
    // Performance optimizations for eraser
    const erasingStateRef = useRef({
        lastEraseTime: 0,
        erasedInCurrentStroke: new Set(),
        isErasing: false
    });

    // Pre-calculate bounding boxes for all paths
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
            erasingStateRef.current.isErasing = mode;
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

    // Get SVG path from stroke with better curves
    const getSvgPathFromStroke = useCallback((stroke) => {
        if (!stroke.length) return '';

        const d = [];

        if (stroke.length < 3) {
            const [x0, y0] = stroke[0];
            const [x1, y1] = stroke[stroke.length - 1];
            d.push('M', x0.toFixed(2), y0.toFixed(2));
            d.push('L', x1.toFixed(2), y1.toFixed(2));
        } else {
            d.push('M', stroke[0][0].toFixed(2), stroke[0][1].toFixed(2));

            for (let i = 1; i < stroke.length - 1; i++) {
                const [x0, y0] = stroke[i];
                const [x1, y1] = stroke[i + 1];
                const cpx = ((x0 + x1) / 2).toFixed(2);
                const cpy = ((y0 + y1) / 2).toFixed(2);
                d.push('Q', x0.toFixed(2), y0.toFixed(2), cpx, cpy);
            }

            const [xLast, yLast] = stroke[stroke.length - 1];
            d.push('L', xLast.toFixed(2), yLast.toFixed(2));
        }

        d.push('Z');
        return d.join(' ');
    }, []);

    // Get point from event with pressure handling
    const getPointFromEvent = useCallback((e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const type = e.pointerType || 'mouse';
        
        if (type !== inputType) {
            setInputType(type);
        }

        const x = (e.clientX - rect.left) / rect.width * width;
        const y = (e.clientY - rect.top) / rect.height * height;

        let pressure = 0.5;
        const timestamp = e.timeStamp || Date.now();

        if (type === 'pen') {
            pressure = e.pressure || 0.5;
            pressure = Math.pow(pressure, 0.6);
            pressure = Math.max(0.1, Math.min(1, pressure));
        } else if (type === 'touch') {
            pressure = 0.6;
        } else {
            if (startTimeRef.current) {
                const timeDiff = timestamp - startTimeRef.current;
                if (timeDiff < 50) {
                    pressure = 0.8;
                }
            }
        }

        return [x, y, pressure, timestamp];
    }, [width, height, inputType]);

    // Enhanced speed-based pressure for mouse
    const calculateSpeedPressure = useCallback((currentPoint, lastPoint) => {
        if (!lastPoint || inputType !== 'mouse') return currentPoint[2];

        const [x1, y1] = currentPoint;
        const [x2, y2] = lastPoint;
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const speed = distance;

        const maxSpeed = 30;
        const minSpeed = 2;

        let pressure;
        if (speed < minSpeed) {
            pressure = 0.9;
        } else if (speed > maxSpeed) {
            pressure = 0.1;
        } else {
            const normalizedSpeed = (speed - minSpeed) / (maxSpeed - minSpeed);
            pressure = 0.9 - (normalizedSpeed * normalizedSpeed * 0.8);
        }

        const lastPressure = lastPoint[2] || 0.5;
        return lastPressure * 0.4 + pressure * 0.6;
    }, [inputType]);

    // Calculate bounding box for a path
    const calculateBoundingBox = useCallback((pathData, strokeWidth = 2) => {
        try {
            // Create temporary SVG element to calculate bounding box
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            tempSvg.style.visibility = 'hidden';
            tempSvg.style.position = 'absolute';
            tempSvg.style.top = '-9999px';
            
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.setAttribute('d', pathData);
            tempSvg.appendChild(tempPath);
            
            document.body.appendChild(tempSvg);
            const bbox = tempPath.getBBox();
            document.body.removeChild(tempSvg);
            
            // Add stroke width padding
            return {
                x: bbox.x - strokeWidth,
                y: bbox.y - strokeWidth,
                width: bbox.width + 2 * strokeWidth,
                height: bbox.height + 2 * strokeWidth
            };
        } catch (e) {
            // Fallback bounding box
            return { x: 0, y: 0, width: width, height: height };
        }
    }, [width, height]);

    // Check if point is near a path using sampling
    const isPointNearPath = useCallback((pathData, x, y, tolerance) => {
        try {
            // Create temporary path element
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            tempSvg.style.position = 'absolute';
            tempSvg.style.top = '-9999px';
            tempSvg.style.visibility = 'hidden';
            
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.setAttribute('d', pathData);
            tempSvg.appendChild(tempPath);
            document.body.appendChild(tempSvg);
            
            // Get total path length
            const totalLength = tempPath.getTotalLength();
            const sampleStep = Math.max(2, totalLength / 50); // Sample fewer points for performance
            
            let isNear = false;
            
            // Sample points along the path
            for (let i = 0; i <= totalLength && !isNear; i += sampleStep) {
                try {
                    const point = tempPath.getPointAtLength(i);
                    const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
                    
                    if (distance <= tolerance) {
                        isNear = true;
                    }
                } catch (e) {
                    // Skip this point if there's an error
                    continue;
                }
            }
            
            document.body.removeChild(tempSvg);
            return isNear;
        } catch (e) {
            console.warn('Path sampling failed:', e);
            return false;
        }
    }, []);

    // Optimized eraser with better hit detection
    const handleErase = useCallback((x, y) => {
        const currentTime = Date.now();
        const erasingState = erasingStateRef.current;
        
        // Moderate throttling - 45fps for better responsiveness
        if (currentTime - erasingState.lastEraseTime < 22) {
            return;
        }
        erasingState.lastEraseTime = currentTime;

        const eraserRadius = eraserWidth / 2;
        
        setPaths(prev => {
            let hasErased = false;
            const newPaths = [];
            const svg = svgRef.current;
            
            for (let i = 0; i < prev.length; i++) {
                const pathObj = prev[i];
                
                // Skip if already erased in this stroke
                if (erasingState.erasedInCurrentStroke.has(i)) {
                    continue;
                }

                if (pathObj.type === 'stroke') {
                    // Get or calculate bounding box
                    let bbox = pathBBoxes.current.get(i);
                    if (!bbox) {
                        bbox = calculateBoundingBox(pathObj.pathData, pathObj.strokeWidth || strokeWidth);
                        pathBBoxes.current.set(i, bbox);
                    }

                    // Quick bounding box collision check
                    if (x < bbox.x - eraserRadius || x > bbox.x + bbox.width + eraserRadius ||
                        y < bbox.y - eraserRadius || y > bbox.y + bbox.height + eraserRadius) {
                        newPaths.push(pathObj);
                        continue;
                    }

                    // More accurate hit detection using path sampling
                    let shouldErase = false;
                    
                    // Check if eraser overlaps with the path
                    if (isPointNearPath(pathObj.pathData, x, y, eraserRadius + (pathObj.strokeWidth || strokeWidth) / 2)) {
                        shouldErase = true;
                    } else {
                        // Check a few points around the eraser circumference for better coverage
                        const checkPoints = 4;
                        for (let i = 0; i < checkPoints && !shouldErase; i++) {
                            const angle = (i / checkPoints) * Math.PI * 2;
                            const checkX = x + Math.cos(angle) * eraserRadius * 0.7;
                            const checkY = y + Math.sin(angle) * eraserRadius * 0.7;
                            
                            if (isPointNearPath(pathObj.pathData, checkX, checkY, eraserRadius * 0.3)) {
                                shouldErase = true;
                            }
                        }
                    }

                    if (shouldErase) {
                        hasErased = true;
                        erasingState.erasedInCurrentStroke.add(i);
                        
                        // Remove from DOM immediately for performance
                        const pathElement = svg?.children[i + (backgroundImageUrl ? 1 : 0)]; // Account for background rect
                        if (pathElement && pathElement.parentNode && pathElement.tagName === 'path') {
                            pathElement.style.opacity = '0';
                            pathElement.style.display = 'none';
                        }
                    } else {
                        newPaths.push(pathObj);
                    }
                } else {
                    newPaths.push(pathObj);
                }
            }

            // Batch DOM updates and notify parent
            if (hasErased) {
                // Clean up bounding boxes for erased paths
                erasingState.erasedInCurrentStroke.forEach(index => {
                    pathBBoxes.current.delete(index);
                });
                
                // Notify parent with debouncing
                if (onCanvasChange) {
                    setTimeout(() => {
                        exportCanvas('png').then(dataUrl => {
                            onCanvasChange(dataUrl);
                        });
                    }, 100);
                }
            }

            return newPaths;
        });
    }, [eraserWidth, calculateBoundingBox, strokeWidth, onCanvasChange, isPointNearPath, backgroundImageUrl]);

    // Handle mouse enter/leave for eraser visibility
    const handleMouseEnter = useCallback(() => {
        if (currentTool === 'eraser') {
            setShowEraser(true);
        }
    }, [currentTool]);

    const handleMouseLeave = useCallback(() => {
        setShowEraser(false);
        // Clear erasing state when leaving
        erasingStateRef.current.erasedInCurrentStroke.clear();
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
        startTimeRef.current = Date.now();

        if (isErasing) {
            erasingStateRef.current.erasedInCurrentStroke.clear();
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
    }, [isErasing, getPointFromEvent, strokeColor]);

    // Pointer move handler with improved performance
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
                // Always erase at current point
                handleErase(point[0], point[1]);
                
                // For faster movements, add interpolation
                const lastPoint = lastPointRef.current;
                if (lastPoint) {
                    const distance = Math.sqrt(
                        (point[0] - lastPoint[0]) ** 2 + (point[1] - lastPoint[1]) ** 2
                    );
                    
                    // Interpolate if movement is significant
                    if (distance > eraserWidth * 0.5) {
                        const steps = Math.min(3, Math.ceil(distance / (eraserWidth * 0.5)));
                        
                        for (let i = 1; i < steps; i++) {
                            const t = i / steps;
                            const interpX = lastPoint[0] + (point[0] - lastPoint[0]) * t;
                            const interpY = lastPoint[1] + (point[1] - lastPoint[1]) * t;
                            handleErase(interpX, interpY);
                        }
                    }
                }
            } else {
                // Drawing mode
                if (inputType === 'mouse' && lastPointRef.current) {
                    point[2] = calculateSpeedPressure(point, lastPointRef.current);
                }

                let shouldAddPoint = true;
                if (inputType === 'pen' && lastPointRef.current) {
                    const [x1, y1] = point;
                    const [x2, y2] = lastPointRef.current;
                    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                    shouldAddPoint = distance > 0.1;
                }

                if (shouldAddPoint) {
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
                }
            }

            lastPointRef.current = point;
        });
    }, [currentTool, isDrawing, isErasing, getPointFromEvent, strokeOptions, getSvgPathFromStroke, inputType, calculateSpeedPressure, handleErase, eraserWidth]);

    // Pointer up handler
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
            erasingStateRef.current.erasedInCurrentStroke.clear();
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
                    
                    // Pre-calculate bounding box for the new path
                    const newIndex = newPaths.length - 1;
                    pathBBoxes.current.set(newIndex, calculateBoundingBox(pathData, strokeWidth));
                    
                    return newPaths;
                });

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
    }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, getSvgPathFromStroke, inputType, strokeWidth, onCanvasChange, getPointFromEvent, calculateBoundingBox]);

    // Clear canvas
    const clearCanvas = useCallback(() => {
        setPaths([]);
        setCurrentPath([]);
        pathBBoxes.current.clear();
        erasingStateRef.current.erasedInCurrentStroke.clear();

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
            
            // Clean up bounding box for removed path
            pathBBoxes.current.delete(prev.length - 1);
            
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
        erasingStateRef.current.isErasing = newIsErasing;
        
        if (!newIsErasing) {
            erasingStateRef.current.erasedInCurrentStroke.clear();
        }
    }, [currentTool]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (frameRequestRef.current) {
                cancelAnimationFrame(frameRequestRef.current);
            }
            pathBBoxes.current.clear();
            erasingStateRef.current.erasedInCurrentStroke.clear();
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
                    />
                ))}
            </svg>

            {/* Optimized eraser cursor */}
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
                        transform: 'translateZ(0)', // Force hardware acceleration
                    }}
                />
            )}
        </div>
    );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;