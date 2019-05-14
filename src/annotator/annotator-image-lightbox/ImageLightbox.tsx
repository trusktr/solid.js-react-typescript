import * as React from 'react'
import Windowable from '../components/Windowable'
import {Events, EventEmitter} from '@mapperai/mapper-annotated-scene'
import {withStyles, createStyles, WithStyles} from '@material-ui/core/styles'
import config from 'annotator-config'
import * as LightboxState from '@mapperai/mapper-annotated-scene'
import {ImageContext} from './ImageContext'
import {LightboxImageDescription, toKeyboardEventHighlights} from '@mapperai/mapper-annotated-scene'

type ImageLightboxProps = WithStyles & {
  channel: EventEmitter
}

export default Windowable(
  withStyles(styles)(
    class ImageLightbox extends React.Component<ImageLightboxProps, {}> {
      private imageListRef = React.createRef<HTMLDivElement>()

      // Let Annotator handle all keyboard events.
      private onKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented) return

        // Annotator ignores repeating events, and streaming them through IPC probably wouldn't perform well.
        if (!event.repeat) {
          this.props.channel.emit(Events.KEYDOWN, toKeyboardEventHighlights(event))
        }
      }

      private onKeyUp = (event: KeyboardEvent): void => {
        if (event.defaultPrevented) return
        this.props.channel.emit(Events.KEYUP, toKeyboardEventHighlights(event))
      }

      private makeOnImageMouseUp(onImageMouseUp: (data: LightboxState.ImageClick) => void) {
        return (ev: React.MouseEvent<HTMLImageElement>) => {
          const img = ev.target as HTMLImageElement
          const rect = img.getBoundingClientRect()
          const pixelX = ev.clientX - rect.left
          const pixelY = ev.clientY - rect.top
          const ratioX = pixelX / img.width
          const ratioY = pixelY / img.height

          onImageMouseUp({
            uuid: img.id,
            ratioX: ratioX,
            ratioY: ratioY,
          } as LightboxState.ImageClick)
        }
      }

      componentDidMount() {
        // non-null assertion here because React guarantees the ref is available
        // before this method is called, and we aren't placing the ref onto
        // differing elements in the JSX markup.
        const div = this.imageListRef.current!

        // if we're in a window
        // TODO get windowed state from Windowable (f.e. via React Context)
        if (div.ownerDocument !== window.document) {
          // using the non-null assertion operator here because we know a div
          // *always* has an owning document (even if the div isn't inserted
          // into the DOM tree)
          const doc = div.ownerDocument!

          doc.addEventListener('keydown', this.onKeyDown)
          doc.addEventListener('keyup', this.onKeyUp)

          // NOTE, there's no need to cleanup these event handlers because
          // closing the window cleans them up.
        }
      }

      componentWillUnmount() {}

      render() {
        const {classes} = this.props
        return (
          <ImageContext.Consumer>
            {({lightboxState, onImageMouseEnter, onImageMouseLeave, onImageMouseUp}) => (
              <div className={classes.imageList} id="image_list" ref={this.imageListRef}>
                {lightboxState.images.map((i: LightboxImageDescription) => (
                  <img
                    key={i.uuid}
                    id={i.uuid}
                    src={i.url}
                    className={i.active ? 'highlighted' : ''}
                    onMouseEnter={() => onImageMouseEnter(i.uuid)}
                    onMouseLeave={() => onImageMouseLeave(i.uuid)}
                    onMouseUp={this.makeOnImageMouseUp(onImageMouseUp)}
                  />
                ))}
              </div>
            )}
          </ImageContext.Consumer>
        )
      }
    }
  )
)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles() {
  return createStyles({
    imageList: {
      padding: 5,
      background: config['startup.background_color'] || '#000',

      '& img': {
        width: '100%',
        height: 'auto',
        border: '1px solid #666',

        '&.highlighted': {
          border: '1px solid #fff',
        },
      },
    },
  })
}
