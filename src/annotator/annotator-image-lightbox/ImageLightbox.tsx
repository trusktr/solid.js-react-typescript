import * as React from 'react'
// import Windowable from '../components/Windowable'
import {Events} from '@mapperai/mapper-annotated-scene'
import {withStyles, createStyles, WithStyles, Theme, StyleRulesCallback} from '@material-ui/core/styles'
import {Typography, Paper} from '@material-ui/core'
import * as LightboxState from '@mapperai/mapper-annotated-scene'
import {ImageContext, ContextState} from './ImageContext'
import {LightboxImageDescription, toKeyboardEventHighlights} from '@mapperai/mapper-annotated-scene'
import {panelBorderRadius, btnTextColor, menuItemSpacing} from '../styleVars'
import {CSSProperties} from '@material-ui/core/styles/withStyles'

// TODO "WithStyles<typeof styles>" is not working here like normal, so using a
// manual "StyleRulesCallback<'images'>" for now.
type ImageLightboxProps = WithStyles<StyleRulesCallback<'images'>> & {}

class ImageLightbox extends React.Component<ImageLightboxProps, {}> {
  // tells react which context type to read from
  // FIXME 'as any' fixes a React type error.
  static contextType = ImageContext as any

  // FIXME this is a workaround for the above React contextType problem
  private get ctx() {
    return this.context as ContextState
  }

  private imageListRef = React.createRef<HTMLDivElement>()

  // Let Annotator handle all keyboard events.
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return

    // Annotator ignores repeating events, and streaming them through IPC probably wouldn't perform well.
    if (!event.repeat) {
      this.ctx.channel.emit(Events.KEYDOWN, toKeyboardEventHighlights(event))
    }
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    this.ctx.channel.emit(Events.KEYUP, toKeyboardEventHighlights(event))
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
          <Paper className={classes.images} id="image_list">
            <div ref={this.imageListRef}>
              <Typography variant="h5" gutterBottom>
                Images
              </Typography>

              {!lightboxState.images.length ? (
                <Typography variant="body1">No images loaded. Click an image in the scene.</Typography>
              ) : (
                lightboxState.images.map((i: LightboxImageDescription) => (
                  <img
                    key={i.uuid}
                    id={i.uuid}
                    src={i.url}
                    className={i.active ? 'highlighted' : ''}
                    onMouseEnter={() => onImageMouseEnter(i.uuid)}
                    onMouseLeave={() => onImageMouseLeave(i.uuid)}
                    onMouseUp={this.makeOnImageMouseUp(onImageMouseUp)}
                  />
                ))
              )}
            </div>
          </Paper>
        )}
      </ImageContext.Consumer>
    )
  }
}

// TODO manual cast to "as StyleRulesCallback<'images'>" is not normally needed
// here. But something is funky in this particular file.
const _LightBox = withStyles(styles as StyleRulesCallback<'images'>)(ImageLightbox)

// TODO fix some Windowable typings. It should forward all props, and expose a forwardRef prop.
// export default Windowable(_LightBox)
export default _LightBox

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    images: {
      padding: 10,
      borderRadius: panelBorderRadius,
      color: btnTextColor.toHexString(),
      marginTop: menuItemSpacing,
      marginBottom: menuItemSpacing,

      '& img': {
        width: '100%',
        height: 'auto',
        border: '1px solid #666',

        '&.highlighted': {
          border: '1px solid #fff',
        },
      },
    } as CSSProperties, // TODO This type cast is not normally needed, but in this file there's currently some new type issue.
  })
}
