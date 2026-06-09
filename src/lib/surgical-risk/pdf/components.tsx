import { View, Text } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { s } from './styles';

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

/** Half-width label + value (two per Row). */
export function Half({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <View style={s.cellHalf}>
      <Text style={wide ? s.lblWide : s.lblNarrow}>{label}</Text>
      <Text style={s.val}>{value && value.length ? value : ' '}</Text>
    </View>
  );
}

/** Full-width label + value. */
export function Full({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <View style={s.cellFull}>
      <Text style={wide ? s.lblWide : s.lblNarrow}>{label}</Text>
      <Text style={s.val}>{value && value.length ? value : ' '}</Text>
    </View>
  );
}
