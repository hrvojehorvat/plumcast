import { CatalogScreen, type CatalogSection } from '../../catalog/CatalogScreen';
import type { MovieItem } from '../../data/movies';
import { MoviePoster } from '../../movies/Poster';
import { useMovieCategories, useMovieList } from '../../movies/useMovies';

const section: CatalogSection<MovieItem> = {
  key: 'movies',
  useCategories: useMovieCategories,
  useList: useMovieList,
  renderPoster: (movie, width, focused) => <MoviePoster movie={movie} width={width} focused={focused} />,
};

export default function MoviesScreen() {
  return <CatalogScreen section={section} />;
}
