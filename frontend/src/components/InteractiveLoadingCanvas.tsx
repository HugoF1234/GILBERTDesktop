import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

interface InteractiveLoadingCanvasProps {
  isActive: boolean;
}

interface Stroke {
  points: Array<{ x: number; y: number }>;
  opacity: number;
  createdAt: number;
}

const InteractiveLoadingCanvas: React.FC<InteractiveLoadingCanvasProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const hoverAnimationRef = useRef<number | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const strokesRef = useRef<Stroke[]>([]); // Stocker tous les traits dessinés
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]); // Trait en cours de dessin

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false }); // Pas d'alpha pour un fond blanc opaque
    if (!ctx) return;

    // Fonction pour configurer le style de dessin
    const setupDrawingStyle = () => {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3B82F6'; // Bleu solide
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
    };

    const resize = () => {
      if (canvas) {
        // Utiliser la taille de la Box parente (qui couvre le DialogContent)
        const boxParent = canvas.parentElement;
        if (boxParent) {
          const rect = boxParent.getBoundingClientRect();
          // Utiliser devicePixelRatio pour un rendu net sur écrans haute résolution
          const dpr = window.devicePixelRatio || 1;
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
          
          // Remplir avec un fond blanc
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, rect.width, rect.height);
          
          // Réappliquer les styles après le scale
          setupDrawingStyle();
        }
      }
    };

    // Configuration initiale
    setupDrawingStyle();
    
    // Initialiser avec fond blanc
    const initialParent = canvas.parentElement;
    if (initialParent) {
      const rect = initialParent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Attendre un peu pour que le DOM soit prêt puis redimensionner
    const timeoutId = setTimeout(resize, 100);
    
    // Observer les changements de taille de la Box parente
    const boxParentToObserve = canvas.parentElement;
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    
    if (boxParentToObserve) {
      resizeObserver.observe(boxParentToObserve);
    }
    
    window.addEventListener('resize', resize);

    // Animation principale : redessiner tous les traits avec leur opacité qui diminue
    const animate = () => {
      if (!ctx || !canvas) return;
      
      const boxParent = canvas.parentElement;
      if (!boxParent) return;
      
      const rect = boxParent.getBoundingClientRect();
      
      // Effacer tout le canvas avec un fond blanc
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Réduire l'opacité de chaque trait progressivement (comme une étoile filante)
      const fadeSpeed = 0.02; // Vitesse de disparition (plus élevé = disparition plus rapide)
      strokesRef.current = strokesRef.current
        .map(stroke => {
          // Réduire l'opacité progressivement à chaque frame
          const newOpacity = Math.max(0, stroke.opacity - fadeSpeed);
          
          return {
            ...stroke,
            opacity: newOpacity,
          };
        })
        .filter(stroke => stroke.opacity > 0); // Supprimer les traits complètement transparents
      
      // Redessiner tous les traits avec leur nouvelle opacité
      strokesRef.current.forEach(stroke => {
        if (stroke.points.length < 2) return;
        
        ctx.save();
        ctx.globalAlpha = stroke.opacity;
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
        
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      });
      
      // Redessiner aussi le trait en cours de dessin
      if (isDrawing.current && currentStrokeRef.current.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
        
        ctx.beginPath();
        ctx.moveTo(currentStrokeRef.current[0].x, currentStrokeRef.current[0].y);
        for (let i = 1; i < currentStrokeRef.current.length; i++) {
          ctx.lineTo(currentStrokeRef.current[i].x, currentStrokeRef.current[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (hoverAnimationRef.current) {
        cancelAnimationFrame(hoverAnimationRef.current);
      }
    };
  }, [isActive]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left),
        y: (e.touches[0].clientY - rect.top),
      };
    } else if ('clientX' in e) {
      return {
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top),
      };
    }
    return { x: 0, y: 0 };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    // Commencer un nouveau trait
    currentStrokeRef.current = [{ x: pos.x, y: pos.y }];
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    
    const pos = getPos(e);
    
    // Ajouter le point au trait en cours
    currentStrokeRef.current.push({ x: pos.x, y: pos.y });
    
    lastPos.current = pos;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    mousePosRef.current = pos;
    
    // Démarrer l'animation au survol si elle n'est pas déjà en cours
    if (!hoverAnimationRef.current && isActive) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        animateHover();
      }
    }
    
    // Continuer le dessin si on est en train de dessiner
    if (isDrawing.current) {
      draw(e);
    }
  };

  const handleMouseLeave = () => {
    stopDraw();
    // Arrêter l'animation au survol
    if (hoverAnimationRef.current) {
      cancelAnimationFrame(hoverAnimationRef.current);
      hoverAnimationRef.current = null;
    }
  };

  const animateHover = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !isActive) return;
    
    const { x, y } = mousePosRef.current;
    
    // Créer un effet de particules/ondes autour de la souris
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 50);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.04)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.max(0, x - 50), Math.max(0, y - 50), 100, 100);
    
    hoverAnimationRef.current = requestAnimationFrame(animateHover);
  };

  const stopDraw = () => {
    if (isDrawing.current && currentStrokeRef.current.length > 1) {
      // Sauvegarder le trait terminé dans la liste des traits
      strokesRef.current.push({
        points: [...currentStrokeRef.current],
        opacity: 1.0, // Opacité initiale à 100%
        createdAt: Date.now(),
      });
      // Réinitialiser le trait en cours
      currentStrokeRef.current = [];
    }
    isDrawing.current = false;
  };

  if (!isActive) return null;

  return (
    <Box
      sx={{
        position: 'absolute', // Absolute par rapport au DialogContent
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        backgroundColor: '#FFFFFF', // Fond blanc garanti
        pointerEvents: 'auto', // Permettre les interactions
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={startDraw}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDraw}
        onMouseLeave={handleMouseLeave}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'default', // Curseur souris normal
          display: 'block',
          backgroundColor: '#FFFFFF', // Fond blanc
          pointerEvents: 'auto', // Permettre les interactions
        }}
      />
    </Box>
  );
};

export default InteractiveLoadingCanvas;

