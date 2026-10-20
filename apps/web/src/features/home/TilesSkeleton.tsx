import styles from './Home.module.css'

/** The tiles of the templates before they are known: three of them, with the measures of the real ones. */
export function TilesSkeleton() {
  return (
    <ul className={`${styles.tiles} ${styles.tilesSkeleton}`}>
      {[0, 1, 2].map((tile) => (
        <li key={tile} />
      ))}
    </ul>
  )
}
