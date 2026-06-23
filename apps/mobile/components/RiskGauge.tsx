import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT_SIZES, riskColor, riskLabel } from '../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RiskGaugeProps {
  score: number;
}

export default function RiskGauge({ score }: RiskGaugeProps) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(score / 100, { duration: 1000 });
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference * (1 - progress.value);
    return {
      strokeDashoffset,
    };
  });

  const getRiskClass = (s: number): 'green' | 'yellow' | 'red' => {
    if (s <= 30) return 'green';
    if (s <= 70) return 'yellow';
    return 'red';
  };

  const riskClass = getRiskClass(score);
  const color = riskColor(riskClass);
  const label = riskLabel(riskClass);

  return (
    <View style={styles.container}>
      <View style={styles.gaugeWrapper}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.8} />
              <Stop offset="100%" stopColor={color} />
            </LinearGradient>
          </Defs>
          {/* Background Circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Foreground Circle */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>

        <View style={styles.centerTextContainer}>
          <Text style={styles.scoreText}>%{score}</Text>
          <Text style={[styles.classLabel, { color }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  gaugeWrapper: {
    position: 'relative',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: FONT_SIZES.display,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  classLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
