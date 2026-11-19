import { memo } from 'react';
import { Poster, yearAndRating } from '../catalog/Poster';
import type { MovieItem } from '../data/movies';
import { movieTitle } from './useMovies';

/** A movie's poster card (`titleless`: just the image, for the movie page). */
export const MoviePoster = memo(function MoviePoster({ movie, width, focused, titleless }: { movie: MovieItem; width: number; focused: boolean; titleless?: boolean }) {
  const { title, year } = movieTitle(movie.name);
  const p = movie.progress;
  return (
    <Poster
      title={title}
      subtitle={yearAndRating(year, movie.rating)}
      image={movie.logo}
      favorite={movie.favorite}
      watched={p?.watched}
      fraction={p && !p.watched && p.durationMs ? Math.min(1, p.positionMs / p.durationMs) : 0}
      width={width}
      focused={focused}
      titleless={titleless}
    />
  );
});
