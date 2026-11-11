import { useEffect, useRef } from 'react'
import { pad } from '../lego/format.js'
import { paintThumb } from './thumbs.js'

function Thumb({ course, width }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    paintThumb(canvas, course)
  }, [course, width])
  return <canvas ref={ref} width={Math.round(width * 2)} height={180} />
}

export default function Rail({ model, course, card, onCourse, onCard }) {
  const scroller = useRef(null)
  const groups = []
  for (const item of model.courses) {
    const last = groups[groups.length - 1]
    if (!last || last.name !== item.section) groups.push({ name: item.section, courses: [item] })
    else last.courses.push(item)
  }

  useEffect(() => {
    const root = scroller.current
    const node = root?.querySelector(`[data-course="${course}"]`)
    if (!root || !node) return
    const left = node.offsetLeft - (root.clientWidth - node.clientWidth) / 2
    root.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [course])

  return (
    <section className="rail" style={{ '--card': `${card}px` }}>
      <div className="rail-head">
        <span>View</span>
        <span className="size-label">S</span>
        <input
          type="range"
          min={132}
          max={228}
          value={card}
          aria-label="Card size"
          onChange={(event) => onCard(Number(event.target.value))}
        />
        <span className="size-label">L</span>
      </div>
      <div className="film" ref={scroller}>
        {groups.map((group) => (
          <div className="group" key={`${group.name}-${group.courses[0].index}`}>
            <div className="cards">
              {group.courses.map((item) => (
                <button
                  key={item.index}
                  type="button"
                  data-course={item.index}
                  className={`step-card ${item.index === course ? 'active' : ''}`}
                  onClick={() => onCourse(item.index)}
                >
                  <span className="step-no">{pad(item.index + 1)}</span>
                  <Thumb course={item} width={card} />
                  <span className="step-title">{item.name}</span>
                  <span className="step-meta">
                    {item.pieces.length} {item.pieces.length === 1 ? 'part' : 'parts'}
                    {item.notes.length ? ` · ${item.notes.length} ${item.notes.length === 1 ? 'note' : 'notes'}` : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="group-label">{group.name}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
