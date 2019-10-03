// import {render} from 'solid-js/dom'
// import S from 's-js'
import {createSignal} from 'solid-js'

// eslint-disable-next-line typescript/explicit-function-return-type
export function variable<T>(value: T) {
  const [get, set] = createSignal<T>(value)

  function variable(value?: undefined): T
  function variable(value: T): void
  function variable(value?: T): void | T {
    if (typeof value === 'undefined') return get()
    set(value)
  }

  return variable
}

const count = variable(0)

setInterval(() => count(count() + 1), 1000)

const test = ((
  // @ts-ignore
  <div>
    // @ts-ignore
    <h1>The count is:</h1>
    {count}
  </div>
) as any) as HTMLDivElement

document.querySelector('#test-solid')!.appendChild(test)

// render(
//   () => (
//     <div>
//       <h1>The count is:</h1>
//       {count()}
//     </div>
//   ),
//   document.querySelector('#test')!
// )
