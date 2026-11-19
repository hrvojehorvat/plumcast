import { memo } from 'react';
import { Poster, yearAndRating } from '../catalog/Poster';
import { episodeLabel } from '../core/series';
import type { SeriesItem } from '../data/series';
import { movieTitle } from '../movies/useMovies';

/** A series' poster card; shows where the user is up to ("S2 E3") while it's being watched. */
export const SeriesPoster = memo(function SeriesPoster({ series, width, focused, titleless }: { series: SeriesItem; width: number; focused: boolean; titleless?: boolean }) {
  const { title, year } = movieTitle(series.name, series.year);
  const p = series.progress;
  return (
    <Poster
      title={title}
      subtitle={yearAndRating(year, series.rating)}
      highlight={p && !p.finished ? episodeLabel({ season: p.season, number: p.episode }) : null}
      image={series.cover}
      favorite={series.favorite}
      watched={p?.finished}
      width={width}
      focused={focused}
      titleless={titleless}
    />
  );
});
