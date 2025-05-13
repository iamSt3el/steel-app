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
    const lastEraseTimeRef = useRef(0);
    const lastErasePositionRef = useRef({ x: 0, y: 0 });
    const activePointerRef = useRef(null);
    const startTimeRef = useRef(null);
    const frameRequestRef = useRef(null);
    const pathCacheRef = useRef(new Map());

    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;

    // Improved stroke options that closely match Excalidraw's output
    const strokeOptions = React.useMemo(() => {
        const baseOptions = {
            size: strokeWidth,
            smoothing: 0.5,      // Much lower for better responsiveness
            streamline: 0.5,     // Higher for smoother curves
            easing: (t) => t * t, // Quadratic for more natural feel
            start: {
                taper: strokeWidth * 0.25,  // Better start taper
                cap: true
            },
            end: {
                taper: strokeWidth * 0.75,  // More pronounced end taper
                cap: true
            }
        };

        if (inputType === 'pen') {
            return {
                ...baseOptions,
                thinning: 0.75,       // Higher thinning for more variation
                simulatePressure: false,
                smoothing: 0.4,       // Very responsive for pen
                streamline: 0.35,     // Good balance for pen
                easing: (t) => Math.pow(t, 0.6), // Better pressure curve
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
                thinning: 0.7,        // Higher for more variation
                simulatePressure: true,
                smoothing: 0.5,       // Lower for more responsiveness
                streamline: 0.5,
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

    // Optimized SVG path generation with smoother curves like Excalidraw
    const getSvgPathFromStroke = useCallback((stroke) => {
        if (!stroke.length) return '';

        const d = [];

        if (stroke.length < 3) {
            // For very short strokes, create a simple path
            const [x0, y0] = stroke[0];
            const [x1, y1] = stroke[stroke.length - 1];
            d.push('M', x0.toFixed(2), y0.toFixed(2));
            d.push('L', x1.toFixed(2), y1.toFixed(2));
        } else {
            // Create smooth curves using quadratic Bezier curves
            d.push('M', stroke[0][0].toFixed(2), stroke[0][1].toFixed(2));

            for (let i = 1; i < stroke.length - 1; i++) {
                const [x0, y0] = stroke[i];
                const [x1, y1] = stroke[i + 1];

                // Control point for smoother curves
                const cpx = ((x0 + x1) / 2).toFixed(2);
                const cpy = ((y0 + y1) / 2).toFixed(2);

                d.push('Q', x0.toFixed(2), y0.toFixed(2), cpx, cpy);
            }

            // Add the last point
            const [xLast, yLast] = stroke[stroke.length - 1];
            d.push('L', xLast.toFixed(2), yLast.toFixed(2));
        }

        d.push('Z');
        return d.join(' ');
    }, []);

    // High-precision point extraction with optimized pressure handling
    const getPointFromEvent = useCallback((e) => {
        const rect = canvasRef.current.getBoundingClientRect();

        // Update input type
        const type = e.pointerType || 'mouse';
        if (type !== inputType) {
            setInputType(type);
        }

        // Get coordinates with subpixel precision
        const x = (e.clientX - rect.left) / rect.width * width;
        const y = (e.clientY - rect.top) / rect.height * height;

        // Enhanced pressure handling
        let pressure = 0.5;
        const timestamp = e.timeStamp || Date.now();

        if (type === 'pen') {
            // Use raw pressure with better scaling
            pressure = e.pressure || 0.5;
            // Apply curve to make pressure more responsive
            pressure = Math.pow(pressure, 0.6);
            pressure = Math.max(0.1, Math.min(1, pressure));
        } else if (type === 'touch') {
            // Consistent pressure for touch
            pressure = 0.6;
        } else {
            // For mouse, calculate initial pressure based on time if it's the start
            if (startTimeRef.current) {
                const timeDiff = timestamp - startTimeRef.current;
                if (timeDiff < 50) {
                    pressure = 0.8; // Start with higher pressure
                }
            }
        }

        return [x, y, pressure, timestamp];
    }, [width, height, inputType]);

    // Improved speed-based pressure for mouse - more like Excalidraw
    const calculateSpeedPressure = useCallback((currentPoint, lastPoint) => {
        if (!lastPoint || inputType !== 'mouse') return currentPoint[2];

        const [x1, y1] = currentPoint;
        const [x2, y2] = lastPoint;

        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const speed = distance;

        // More aggressive pressure variation like Excalidraw
        const maxSpeed = 30; // Lower threshold for more variation
        const minSpeed = 2;

        // Calculate pressure based on speed with more variation
        let pressure;
        if (speed < minSpeed) {
            pressure = 0.9; // High pressure for slow movement
        } else if (speed > maxSpeed) {
            pressure = 0.1; // Low pressure for fast movement
        } else {
            // Exponential curve for more natural pressure variation
            const normalizedSpeed = (speed - minSpeed) / (maxSpeed - minSpeed);
            pressure = 0.9 - (normalizedSpeed * normalizedSpeed * 0.8);
        }

        // Smooth transition with less damping for more responsiveness
        const lastPressure = lastPoint[2] || 0.5;
        return lastPressure * 0.4 + pressure * 0.6;
    }, [inputType]);

    // Handle pointer leave/cancel events properly
    const handlePointerLeave = useCallback((e) => {
        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        // For pen input, treat pointer leave as a gradual lift
        if (inputType === 'pen') {
            // Add a final point with zero pressure to create natural taper
            const rect = canvasRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * width;
            const y = (e.clientY - rect.top) / rect.height * height;
            const finalPoint = [x, y, 0]; // Zero pressure

            setCurrentPath(prev => {
                const newPath = [...prev, finalPoint];

                // Update temp path one last time
                const svg = svgRef.current;
                const tempPath = svg?.querySelector('#temp-path');

                if (tempPath && newPath.length > 1) {
                    try {
                        const stroke = getStroke(newPath, strokeOptions);
                        const pathData = getSvgPathFromStroke(stroke);
                        tempPath.setAttribute('d', pathData);
                    } catch (error) {
                        console.warn('Error updating final path:', error);
                    }
                }

                return newPath;
            });
        }

        // Then handle the stroke ending manually without calling handlePointerUp
        setIsDrawing(false);
        activePointerRef.current = null;

        // Cancel any pending frame request
        if (frameRequestRef.current) {
            cancelAnimationFrame(frameRequestRef.current);
            frameRequestRef.current = null;
        }

        // Clear path cache
        pathCacheRef.current.clear();

        // Release pointer capture
        if (canvasRef.current?.releasePointerCapture) {
            canvasRef.current.releasePointerCapture(e.pointerId);
        }

        if (!isErasing && currentPath.length > 0) {
            try {
                // Generate final stroke using the current path
                const stroke = getStroke(currentPath, strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);

                // Remove temp path
                const svg = svgRef.current;
                const tempPath = svg?.querySelector('#temp-path');
                if (tempPath) {
                    tempPath.remove();
                }

                // Add to paths
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
    }, [isDrawing, inputType, width, height, strokeOptions, getSvgPathFromStroke, currentPath, isErasing, strokeColor, onCanvasChange]);

    // Handle mouse enter/leave for eraser visibility
    const handleMouseEnter = useCallback(() => {
        if (currentTool === 'eraser') {
            setShowEraser(true);
        }
    }, [currentTool]);

    const handleMouseLeave = useCallback(() => {
        setShowEraser(false);
    }, []);

    // Optimized pointer down handler
    const handlePointerDown = useCallback((e) => {
        if (!canvasRef.current || !e.isPrimary) return;

        setIsDrawing(true);
        activePointerRef.current = e.pointerId;
        e.preventDefault();
        e.stopPropagation();

        // Capture pointer
        if (canvasRef.current.setPointerCapture) {
            canvasRef.current.setPointerCapture(e.pointerId);
        }

        const point = getPointFromEvent(e);
        lastPointRef.current = point;
        startTimeRef.current = Date.now();

        if (isErasing) {
            handleErase(point[0], point[1]);
        } else {
            setCurrentPath([point]);

            // Create initial path immediately
            const svg = svgRef.current;
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.id = 'temp-path';
            tempPath.setAttribute('fill', strokeColor);
            tempPath.setAttribute('stroke', 'none');
            tempPath.setAttribute('fill-rule', 'nonzero');

            svg.appendChild(tempPath);
        }
    }, [isErasing, getPointFromEvent, strokeColor]);

    // Optimized erasing with better performance
    const handleErase = useCallback((x, y) => {
        const eraserRadius = eraserWidth / 2;

        setPaths(prev => {
            let hasErased = false;
            const newPaths = [];

            for (const pathObj of prev) {
                if (pathObj.type === 'stroke') {
                    // Quick bounding box check first
                    if (!pathObj.bbox) {
                        // Calculate and cache bounding box if not exists
                        try {
                            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                            tempPath.setAttribute('d', pathObj.pathData);
                            const bbox = tempPath.getBBox();
                            pathObj.bbox = {
                                x: bbox.x - (pathObj.strokeWidth || strokeWidth),
                                y: bbox.y - (pathObj.strokeWidth || strokeWidth),
                                width: bbox.width + 2 * (pathObj.strokeWidth || strokeWidth),
                                height: bbox.height + 2 * (pathObj.strokeWidth || strokeWidth)
                            };
                        } catch (e) {
                            // Fallback if getBBox fails
                            pathObj.bbox = { x: 0, y: 0, width: width, height: height };
                        }
                    }

                    // Quick bounding box collision check
                    const bbox = pathObj.bbox;
                    if (x < bbox.x - eraserRadius || x > bbox.x + bbox.width + eraserRadius ||
                        y < bbox.y - eraserRadius || y > bbox.y + bbox.height + eraserRadius) {
                        // Eraser doesn't overlap with this path's bounding box
                        newPaths.push(pathObj);
                        continue;
                    }

                    // More precise collision detection only if bounding box overlaps
                    let shouldErase = false;

                    // Sample fewer points for better performance
                    const numCheckPoints = 5;
                    const checkRadius = eraserRadius * 0.8;

                    // Check points around the circle
                    for (let i = 0; i < numCheckPoints && !shouldErase; i++) {
                        const angle = (i / numCheckPoints) * Math.PI * 2;
                        const checkX = x + Math.cos(angle) * checkRadius;
                        const checkY = y + Math.sin(angle) * checkRadius;

                        // Check if point is within the path's bounding box
                        if (checkX >= bbox.x && checkX <= bbox.x + bbox.width &&
                            checkY >= bbox.y && checkY <= bbox.y + bbox.height) {
                            shouldErase = true;
                            break;
                        }
                    }

                    if (!shouldErase) {
                        newPaths.push(pathObj);
                    } else {
                        hasErased = true;
                    }
                } else {
                    newPaths.push(pathObj);
                }
            }

            // Only notify parent if something was actually erased
            if (hasErased && onCanvasChange) {
                // Defer the export to avoid blocking the UI
                setTimeout(() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // White background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);

                    // Convert SVG to image
                    const svg = svgRef.current;
                    if (svg) {
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                        const url = URL.createObjectURL(svgBlob);

                        const img = new Image();
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0);
                            URL.revokeObjectURL(url);
                            onCanvasChange(canvas.toDataURL('image/png', 0.95));
                        };
                        img.src = url;
                    }
                }, 50); // Increased delay to reduce frequency
            }

            return newPaths;
        });
    }, [eraserWidth, width, height, strokeWidth, onCanvasChange]);

    // Enhanced pointer move handler with eraser position tracking and throttling
    const handlePointerMove = useCallback((e) => {
        if (!canvasRef.current) return;

        // Always update eraser position when it's the current tool
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

        // Cancel previous frame request
        if (frameRequestRef.current) {
            cancelAnimationFrame(frameRequestRef.current);
        }

        // Always process move events, even if there's no movement
        // This allows for pressure-only changes like lifting the pen gradually
        frameRequestRef.current = requestAnimationFrame(() => {
            const point = getPointFromEvent(e);

            if (isErasing) {
                // Throttle erasing for better performance
                const now = Date.now();
                const timeSinceLastErase = now - lastEraseTimeRef.current;
                const distance = Math.sqrt(
                    Math.pow(point[0] - lastErasePositionRef.current.x, 2) +
                    Math.pow(point[1] - lastErasePositionRef.current.y, 2)
                );

                // Only erase if enough time has passed OR moved enough distance
                if (timeSinceLastErase > 16 || distance > eraserWidth * 0.1) { // ~60fps max
                    handleErase(point[0], point[1]);
                    lastEraseTimeRef.current = now;
                    lastErasePositionRef.current = { x: point[0], y: point[1] };
                }
            } else {
                // Calculate pressure for mouse
                if (inputType === 'mouse' && lastPointRef.current) {
                    point[2] = calculateSpeedPressure(point, lastPointRef.current);
                }

                // Check for very small movements for pen/stylus
                let shouldAddPoint = true;
                if (inputType === 'pen' && lastPointRef.current) {
                    const [x1, y1] = point;
                    const [x2, y2] = lastPointRef.current;
                    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

                    // Don't skip points based on distance for pen - pressure changes matter
                    // Only skip if the point is exactly the same
                    shouldAddPoint = distance > 0.1;
                }

                if (shouldAddPoint) {
                    setCurrentPath(prev => {
                        const newPath = [...prev, point];

                        // Update temp path immediately
                        const svg = svgRef.current;
                        const tempPath = svg?.querySelector('#temp-path');

                        if (tempPath && newPath.length > 1) {
                            try {
                                // Use cached stroke if available
                                const key = newPath.length;
                                let stroke = pathCacheRef.current.get(key);

                                if (!stroke) {
                                    stroke = getStroke(newPath, strokeOptions);
                                    pathCacheRef.current.set(key, stroke);
                                }

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

    // Improved pointer up handler with gradual pen lifting
    const handlePointerUp = useCallback((e) => {
        if (!isDrawing || e.pointerId !== activePointerRef.current) return;

        // For pen input, check if pressure is actually zero
        if (inputType === 'pen' && e.pressure > 0.05) {
            // Don't end the stroke if there's still pressure
            // Add a final point with the current pressure
            const finalPoint = getPointFromEvent(e);
            setCurrentPath(prev => [...prev, finalPoint]);
            return;
        }

        setIsDrawing(false);
        activePointerRef.current = null;

        // Cancel any pending frame request
        if (frameRequestRef.current) {
            cancelAnimationFrame(frameRequestRef.current);
            frameRequestRef.current = null;
        }

        // Clear path cache
        pathCacheRef.current.clear();

        // Release pointer capture
        if (canvasRef.current?.releasePointerCapture) {
            canvasRef.current.releasePointerCapture(e.pointerId);
        }

        if (!isErasing && currentPath.length > 0) {
            try {
                // Add a final point at pen up location for better endings
                const finalPoint = getPointFromEvent(e);
                const finalPath = [...currentPath, finalPoint];

                // Generate final stroke
                const stroke = getStroke(finalPath, strokeOptions);
                const pathData = getSvgPathFromStroke(stroke);

                // Remove temp path
                const svg = svgRef.current;
                const tempPath = svg?.querySelector('#temp-path');
                if (tempPath) {
                    tempPath.remove();
                }

                // Add to paths
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
    }, [isDrawing, isErasing, currentPath, strokeColor, strokeOptions, getSvgPathFromStroke, inputType, strokeWidth, onCanvasChange, getPointFromEvent]);

    // Clear canvas
    const clearCanvas = useCallback(() => {
        setPaths([]);
        setCurrentPath([]);
        pathCacheRef.current.clear();

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
        setIsErasing(currentTool === 'eraser');
    }, [currentTool]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (frameRequestRef.current) {
                cancelAnimationFrame(frameRequestRef.current);
            }
            pathCacheRef.current.clear();
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
            onPointerLeave={handlePointerLeave}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <canvas
                ref={canvasRef}
                width={width * dpr}
                height={height * dpr}
                className={styles.canvas}
                style={{
                    touchAction: 'none',  // Essential for proper pen/touch support
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
                        animation: 'pulse 1s infinite',
                    }}
                />
            )}
        </div>
    );
});

SmoothCanvas.displayName = 'SmoothCanvas';

export default SmoothCanvas;