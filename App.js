import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Platform, Linking } from 'react-native';
import { useTikTokFilter } from './tiktok';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BIRD_SIZE = 46;
const BIRD_X = SCREEN_WIDTH * 0.25;
const GRAVITY = 0.55;
const FLAP_POWER = -9.5;
const PIPE_WIDTH = 75;
const PIPE_GAP = 210;
const PIPE_SPEED = 4;

export default function App() {
  const fx = useTikTokFilter();
  const fxRef = useRef(fx);
  fxRef.current = fx;

  const [renderTick, setRenderTick] = useState(0);

  const stateRef = useRef({
    birdY: SCREEN_HEIGHT / 2,
    velocity: 0,
    pipes: [],
    score: 0,
    status: 'START', // START, PLAYING, GAMEOVER
    flash: 0,
  });

  const flap = useCallback(() => {
    const state = stateRef.current;
    if (state.status === 'START') {
      state.status = 'PLAYING';
      state.velocity = FLAP_POWER;
    } else if (state.status === 'PLAYING') {
      state.velocity = FLAP_POWER;
    } else if (state.status === 'GAMEOVER') {
      stateRef.current = {
        birdY: SCREEN_HEIGHT / 2,
        velocity: 0,
        pipes: [],
        score: 0,
        status: 'START',
        flash: 0,
      };
      setRenderTick(t => t + 1);
    }
  }, []);

  useEffect(() => {
    let raf;
    let prevMouth = 0;
    let prevBeta = 0;

    const loop = () => {
      const state = stateRef.current;
      const c = fxRef.current;

      // Face & Motion Controls (Debounced triggers)
      if (c.mouthOpen > 0.35 && prevMouth <= 0.15) flap();
      prevMouth = c.mouthOpen;

      if (c.deviceTilt && c.deviceTilt.beta < -15 && prevBeta >= -5) flap();
      if (c.deviceTilt) prevBeta = c.deviceTilt.beta;

      if (state.status === 'PLAYING') {
        // Apply Physics
        state.velocity += GRAVITY;
        state.birdY += state.velocity;

        // Process Pipes
        for (let i = 0; i < state.pipes.length; i++) {
          let p = state.pipes[i];
          p.x -= PIPE_SPEED;

          // Collision Detection (Hitbox slightly smaller than visual bird for fairness)
          const hitboxSize = BIRD_SIZE * 0.65;
          const hitX = BIRD_X + (BIRD_SIZE - hitboxSize) / 2;
          const hitY = state.birdY + (BIRD_SIZE - hitboxSize) / 2;

          const birdRect = {
            left: hitX,
            right: hitX + hitboxSize,
            top: hitY,
            bottom: hitY + hitboxSize,
          };

          const pipeTopRect = {
            left: p.x,
            right: p.x + PIPE_WIDTH,
            top: 0,
            bottom: p.topHeight,
          };

          const pipeBotRect = {
            left: p.x,
            right: p.x + PIPE_WIDTH,
            top: p.topHeight + PIPE_GAP,
            bottom: SCREEN_HEIGHT,
          };

          const hitTop = (birdRect.right > pipeTopRect.left && birdRect.left < pipeTopRect.right && birdRect.top < pipeTopRect.bottom);
          const hitBot = (birdRect.right > pipeBotRect.left && birdRect.left < pipeBotRect.right && birdRect.bottom > pipeBotRect.top);

          if (hitTop || hitBot || state.birdY < -BIRD_SIZE || state.birdY > SCREEN_HEIGHT) {
            state.status = 'GAMEOVER';
            state.flash = 1;
          }

          // Score Increment
          if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
            p.passed = true;
            state.score += 1;
          }
        }

        // Spawn New Pipes
        const lastPipe = state.pipes[state.pipes.length - 1];
        if (!lastPipe || lastPipe.x < SCREEN_WIDTH - 240) {
          const minPipeHeight = 100;
          const maxPipeHeight = SCREEN_HEIGHT - PIPE_GAP - 100;
          const topHeight = Math.max(minPipeHeight, Math.random() * maxPipeHeight);
          state.pipes.push({ x: SCREEN_WIDTH, topHeight, passed: false });
        }

        // Cleanup Offscreen Pipes
        if (state.pipes.length > 0 && state.pipes[0].x < -PIPE_WIDTH) {
          state.pipes.shift();
        }
      }

      // Flash decay
      if (state.flash > 0) {
        state.flash = Math.max(0, state.flash - 0.05);
      }

      setRenderTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [flap]);

  const state = stateRef.current;
  
  // Tie bird visual rotation to face tilt if active, otherwise fallback to velocity
  const birdRotation = fx.faceReady && fx.tilt ? fx.tilt : Math.min(Math.max(state.velocity * 4, -30), 90);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <video
          ref={fx.videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            transform: 'scaleX(-1)'
          }}
        />
      )}

      {Platform.OS !== 'web' && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#2b2d42' }]} />
      )}

      {fx.DebugHUD}

      <Pressable onPress={flap} style={StyleSheet.absoluteFillObject}>
        {/* Render Pipes */}
        {state.pipes.map((pipe, i) => (
          <React.Fragment key={`pipe-${i}`}>
            {/* Top Pipe */}
            <View
              style={[
                styles.pipe,
                {
                  left: pipe.x,
                  top: 0,
                  height: pipe.topHeight,
                  borderBottomWidth: 4,
                }
              ]}
            />
            {/* Bottom Pipe */}
            <View
              style={[
                styles.pipe,
                {
                  left: pipe.x,
                  top: pipe.topHeight + PIPE_GAP,
                  bottom: 0,
                  borderTopWidth: 4,
                }
              ]}
            />
          </React.Fragment>
        ))}

        {/* Render Bird */}
        <View
          style={[
            styles.bird,
            {
              top: state.birdY,
              left: BIRD_X,
              transform: [{ rotate: `${birdRotation}deg` }],
            }
          ]}
        >
          {/* Eye */}
          <View style={styles.birdEye}>
             <View style={styles.birdPupil} />
          </View>
          {/* Beak */}
          <View style={styles.birdBeak} />
          {/* Wing */}
          <View style={[styles.birdWing, { transform: [{ rotate: state.velocity < 0 ? '-20deg' : '0deg' }] }]} />
        </View>

        {/* Start Overlay */}
        {state.status === 'START' && (
          <View style={styles.overlay}>
            <Text style={styles.titleText}>FLAPPY FACE</Text>
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionText}>
                {fx.faceReady ? "😮 OPEN MOUTH TO FLAP" : "👇 TAP SCREEN TO FLAP"}
              </Text>
              {fx.faceReady && (
                <Text style={styles.subInstructionText}>Tilt your head to steer!</Text>
              )}
            </View>
          </View>
        )}

        {/* Game Over Overlay */}
        {state.status === 'GAMEOVER' && (
          <View style={styles.overlay}>
            <Text style={styles.gameOverText}>GAME OVER</Text>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreCardTitle}>SCORE</Text>
              <Text style={styles.scoreCardValue}>{state.score}</Text>
            </View>
            <Text style={styles.instructionText}>TAP TO RESTART</Text>
          </View>
        )}

        {/* Active Score */}
        {state.status === 'PLAYING' && (
          <Text style={styles.liveScore}>{state.score}</Text>
        )}

        {/* Game Over Flash */}
        {state.flash > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(255,255,255,${state.flash})`, zIndex: 100 }]} />
        )}

        {/* Warning Messages */}
        {fx.cameraError && (
          <View style={styles.warningBoxCenter}>
            <Text style={styles.warningText}>Allow camera to play with face controls</Text>
          </View>
        )}
        {Platform.OS !== 'web' && (
           <View style={styles.warningBoxTop}>
              <Text style={styles.warningText}>Open in browser for face tracking!</Text>
           </View>
        )}

      </Pressable>

      <Pressable
        onPress={() => Linking.openURL('https://mypip.aikarotech.dev')}
        style={styles.badge}
      >
        <Text style={styles.badgeText}>Made with myPip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  bird: {
    position: 'absolute',
    width: BIRD_SIZE,
    height: BIRD_SIZE,
    backgroundColor: '#FFE135',
    borderRadius: BIRD_SIZE / 2,
    borderWidth: 3,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 10,
  },
  birdEye: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  birdPupil: {
    width: 5,
    height: 5,
    backgroundColor: '#000',
    borderRadius: 2.5,
    marginLeft: 3,
  },
  birdBeak: {
    position: 'absolute',
    right: -12,
    top: 22,
    width: 18,
    height: 12,
    backgroundColor: '#FF6B6B',
    borderWidth: 2,
    borderColor: '#000',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  birdWing: {
    position: 'absolute',
    left: 2,
    top: 20,
    width: 20,
    height: 12,
    backgroundColor: '#FCE883',
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 8,
  },
  pipe: {
    position: 'absolute',
    width: PIPE_WIDTH,
    backgroundColor: '#4ade80',
    borderWidth: 4,
    borderColor: '#064e3b',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    zIndex: 5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  titleText: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
    textShadowColor: '#000',
    textShadowOffset: { width: -2, height: 3 },
    textShadowRadius: 1,
    marginBottom: 40,
    textAlign: 'center',
  },
  gameOverText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#ef4444',
    letterSpacing: 2,
    textShadowColor: '#fff',
    textShadowOffset: { width: -2, height: 2 },
    textShadowRadius: 1,
    marginBottom: 20,
  },
  scoreCard: {
    backgroundColor: '#fde047',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#000',
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
  },
  scoreCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#a16207',
    marginBottom: 5,
  },
  scoreCardValue: {
    fontSize: 56,
    fontWeight: '900',
    color: '#000',
  },
  instructionsContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  instructionText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: '#000',
    textShadowOffset: { width: -1.5, height: 1.5 },
    textShadowRadius: 1,
    marginBottom: 8,
  },
  subInstructionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a7f3d0',
  },
  liveScore: {
    position: 'absolute',
    top: 80,
    width: '100%',
    textAlign: 'center',
    fontSize: 72,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: '#000',
    textShadowOffset: { width: -3, height: 3 },
    textShadowRadius: 2,
    zIndex: 15,
  },
  warningBoxCenter: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239,68,68,0.95)',
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7f1d1d',
    alignItems: 'center',
  },
  warningBoxTop: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    zIndex: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  warningText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  badge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  }
});