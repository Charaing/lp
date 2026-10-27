// Which pressing a record gets. Real records are black; album.json can ask for colour.
export function defaultStyle(album) {
  return album.vinyl?.style ?? (album.vinyl?.color ? 'solid' : 'black');
}
