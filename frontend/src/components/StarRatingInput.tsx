export function StarRatingInput({ value, onChange, disabled = false, label = 'Nota' }: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div className="star-rating-input" role="group" aria-label={label}>
      <div className="star-picker">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="star-slot" key={index}>
            <span className="star-outline" aria-hidden="true">☆</span>
            <span
              className="star-fill"
              style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}
              aria-hidden="true"
            ><span>★</span></span>
            {[0.5, 1].map((part) => {
              const rating = index + part
              return (
                <button
                  key={part}
                  type="button"
                  className={`star-target ${part === 0.5 ? 'half' : 'full'}`}
                  aria-label={`${rating.toLocaleString('pt-BR')} ${rating === 1 ? 'estrela' : 'estrelas'}`}
                  aria-pressed={value === rating}
                  disabled={disabled}
                  onClick={() => onChange(rating)}
                />
              )
            })}
          </span>
        ))}
      </div>
      <span className="star-value" aria-live="polite">
        {value > 0 ? `${value.toLocaleString('pt-BR')} / 5` : 'Selecione uma nota'}
      </span>
    </div>
  )
}

export function StarRatingDisplay({ value }: { value: number }) {
  return (
    <span className="star-rating-display" aria-label={`Nota ${value.toLocaleString('pt-BR')} de 5 estrelas`}>
      <span className="star-picker" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="star-slot" key={index}>
            <span className="star-outline">☆</span>
            <span className="star-fill" style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}>
              <span>★</span>
            </span>
          </span>
        ))}
      </span>
      <span>{value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / 5</span>
    </span>
  )
}
