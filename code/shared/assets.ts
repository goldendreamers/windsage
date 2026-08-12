import type { ImageSourcePropType } from 'react-native';
import type { MetricKey } from './types';

export const brandImages = {
  mark: require('../../assets/ui/mark.png') as ImageSourcePropType,
  bootMark: require('../../assets/ui/boot-mark.png') as ImageSourcePropType,
  emptyHero: require('../../assets/ui/empty-hero.png') as ImageSourcePropType,
  wind: require('../../assets/ui/wind.png') as ImageSourcePropType,
  gust: require('../../assets/ui/gust.png') as ImageSourcePropType,
  temp: require('../../assets/ui/temp.png') as ImageSourcePropType,
  wave: require('../../assets/ui/wave.png') as ImageSourcePropType,
  check: require('../../assets/ui/check.png') as ImageSourcePropType,
  bell: require('../../assets/ui/bell.png') as ImageSourcePropType,
  station: require('../../assets/ui/station.png') as ImageSourcePropType,
};

export function metricIcon(metric: MetricKey): ImageSourcePropType {
  switch (metric) {
    case 'wind_avg':
      return brandImages.wind;
    case 'wind_max':
      return brandImages.gust;
    case 'temperature':
      return brandImages.temp;
    case 'wave_height':
      return brandImages.wave;
  }
}
