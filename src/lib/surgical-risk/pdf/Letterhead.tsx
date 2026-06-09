import { View, Text } from '@react-pdf/renderer';
import { s, HOSPITAL_NAME, HOSPITAL_ADDRESS } from './styles';

/**
 * Document letterhead. Currently a styled text header matching the existing
 * EHRC documents. To use the real EVEN logo (Decision 3): drop the asset in
 * /public, read it to a data URL in render.tsx, and render an <Image> here
 * above the hospital name. Built as a single swappable component for exactly that.
 */
export function Letterhead({ title }: { title?: string }) {
  return (
    <View>
      <Text style={s.title}>{HOSPITAL_NAME}</Text>
      <Text style={s.sub}>{HOSPITAL_ADDRESS}</Text>
      {title ? <Text style={s.title2}>{title}</Text> : null}
    </View>
  );
}
