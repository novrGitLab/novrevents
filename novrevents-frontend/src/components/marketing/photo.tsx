export function EditorialPhoto({
  name,
  alt,
  priority = false,
  sizes = '100vw',
  className,
}: {
  name: string
  alt: string
  priority?: boolean
  sizes?: string
  className?: string
}) {
  return (
    <img
      className={className}
      src={'/photography/' + name + '-960.webp'}
      srcSet={[480, 960, 1440]
        .map((width) => '/photography/' + name + '-' + width + '.webp ' + width + 'w')
        .join(', ')}
      sizes={sizes}
      width={1440}
      height={name === 'opening' ? 655 : 960}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  )
}
