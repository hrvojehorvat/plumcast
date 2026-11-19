import { CatalogScreen, type CatalogSection } from '../../catalog/CatalogScreen';
import type { SeriesItem } from '../../data/series';
import { SeriesPoster } from '../../series/SeriesPoster';
import { useSeriesCategories, useSeriesList } from '../../series/useSeries';

const section: CatalogSection<SeriesItem> = {
  key: 'series',
  useCategories: useSeriesCategories,
  useList: useSeriesList,
  renderPoster: (series, width, focused) => <SeriesPoster series={series} width={width} focused={focused} />,
};

export default function SeriesScreen() {
  return <CatalogScreen section={section} />;
}
