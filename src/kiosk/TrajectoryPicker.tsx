/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import './TrajectoryPicker.css'
const {default: config} = require(`${__base}/src/config`)
import * as lodash from 'lodash'
import * as React from 'react'
import * as Modal from 'react-modal'
import * as Electron from 'electron'
import Logger from '../util/log'
import * as Fs from 'fs'
import * as AsyncFile from 'async-file'
import Executable from 'executable'
import * as ChildProcess from 'child_process'
import {s1SessionFileName, TrajectoryDataSet, trajectoryFileName} from '../util/Perception'
import * as VirtualList from 'react-tiny-virtual-list'

// eslint-disable-next-line typescript/no-explicit-any
const List = VirtualList as any
const log = Logger(__filename)
const dialog = Electron.remote.dialog

export type TrajectoryFileSelectedCallback = (path: string) => void

interface TrajectoryPickerProps {
}

interface TrajectoryPickerState {
	enabled: boolean
	isOpen: boolean
	isProcessing: boolean
	processedTrajectories: TrajectoryDataSet[]
	unprocessedTrajectories: TrajectoryDataSet[]
}

Modal.setAppElement('#root')

export default
class TrajectoryPicker extends React.Component<TrajectoryPickerProps, TrajectoryPickerState> {
	private onTrajectoryFileSelected: TrajectoryFileSelectedCallback | null
	private processedTrajectoriesDir: string
	private unprocessedTrajectoriesDir: string
	private localizerPath: string
	private processingCheckTimer: number

	constructor(props: TrajectoryPickerProps) {
		super(props)
		this.onTrajectoryFileSelected = null
		this.processedTrajectoriesDir = config['fly_through.trajectory_picker.processed_trajectories_dir']
		this.unprocessedTrajectoriesDir = config['fly_through.trajectory_picker.unprocessed_trajectories_dir']
		this.localizerPath = config['perception.offline_localizer_path']
		this.clearProcessingCheckTimer()

		this.state = {
			enabled: false,
			isOpen: false,
			isProcessing: false,
			processedTrajectories: [],
			unprocessedTrajectories: [],
		}
	}

	componentDidMount(): void {
		// All for one, one for all
		if (!(this.processedTrajectoriesDir || this.unprocessedTrajectoriesDir || this.localizerPath)) return

		const localizerPromise = Executable(this.localizerPath)
			.then(isExecutable => {
				if (!isExecutable) throw Error('Offline localizer is not executable')
			})
			.catch(err => {
				log.error(`Can't load offline localizer: ${err.message}`)
				throw err
			})
		const promises: Promise<void>[] = [localizerPromise]
		const dirs = [this.processedTrajectoriesDir, this.unprocessedTrajectoriesDir]

		dirs.forEach(dir => {
			const promise = AsyncFile.readdir(dir)
				.then(() => {}) // tslint:disable-line:no-empty
				.catch(err => {
					log.error(`Can't open trajectories directory: ${err.message}`)
					throw err
				})

			promises.push(promise)
		})

		Promise.all(promises)
			.then(() => this.setState({enabled: true}))
			.catch(err => dialog.showErrorBox('Offline data-set configuration error', err.message))
	}

	componentWillUnmount(): void {
		this.clearProcessingCheckTimer()
	}

	render(): JSX.Element {
		if (!this.state.enabled || !this.state.isOpen) return <div/>

		return (
			<Modal
				contentLabel="Choose a data set"
				style={trajectoryPickerStyle}
				isOpen={this.state.isOpen}
				shouldCloseOnOverlayClick={false}
			>
				<button className="menu_btn black_text" onClick={this.closeModal}>&#x2612;</button>
				<h2>Play back a data set</h2>
				{this.processed()}
				{this.unprocessed()}
			</Modal>
		)
	}

	openModal = (cb: TrajectoryFileSelectedCallback): void => {
		if (!this.state.enabled) {
			log.warn('TrajectoryPicker is disabled')
			return
		}

		if (this.onTrajectoryFileSelected) log.error('trajectoryFileSelected callback should not be present in openModal()')

		if (!this.processingCheckTimer) {
			this.checkTrajectoryDirectories()
			this.processingCheckTimer = window.setInterval(this.checkTrajectoryDirectories, 5000)
		}

		this.onTrajectoryFileSelected = cb
		this.setState({isOpen: true})
	}

	private closeModal = (): void => {
		this.clearProcessingCheckTimer()
		this.onTrajectoryFileSelected = null
		this.setState({isOpen: false})
	}

	private playTrajectory(path: string): () => void {
		return (): void => {
			if (this.onTrajectoryFileSelected) this.onTrajectoryFileSelected(path)

			this.closeModal()
		}
	}

	private loadDirectory(dataSetRoot: string, checkChildFileName: string): TrajectoryDataSet[] {
		if (!dataSetRoot) return []

		let names: string[] = []

		try {
			names = Fs.readdirSync(dataSetRoot).sort()
		} catch (err) {
			log.warn(`can't load trajectory files at ${dataSetRoot}`)
			dialog.showErrorBox('Fly-through Load Error', err.message)
		}

		return names
			.map(name => {
				return {
					name: name,
					path: [dataSetRoot, name, checkChildFileName].join('/'),
				} as TrajectoryDataSet
			})
			.filter(dataSet => Fs.existsSync(dataSet.path))
	}

	private processed(): JSX.Element {
		const dataSets = this.state.processedTrajectories

		if (!dataSets.length) return <div><em>No processed data sets are available.</em></div>

		return (
			<div>
				<h3>Processed</h3>
				<p className='center'>{dataSets.length} Data Sets</p>
				<List
					width='100%'
					height={194}
					itemCount={dataSets.length}
					itemSize={44}
					scrollDirection='vertical'
					renderItem={({index, style}): JSX.Element =>
						<div key={index} style={style}>
							<button className="mdc-button mdc-button--raised" onClick={this.playTrajectory(dataSets[index].path)}>
								<span>{dataSets[index].name}</span>
								<i className="material-icons mdc-button__icon" aria-hidden="true">play_arrow</i>
							</button>
						</div>
					}
				/>
			</div>
		)
	}

	private unprocessed(): JSX.Element {
		const dataSets = this.state.unprocessedTrajectories

		if (!dataSets.length) return <div/>

		const processingButton = this.state.isProcessing
			? (
				<button id="processing_button" className="mdc-button mdc-button--raised">
					<span>Processing…</span>
				</button>
			)
			: (
				<button className="mdc-button mdc-button--raised" onClick={this.startProcessing}>
					<span>Start Processing</span>
					<i className="material-icons mdc-button__icon" aria-hidden="true">update</i>
				</button>
			)

		return (
			<div>
				<h3>Unprocessed</h3>
				<p className='center'>{dataSets.length} Data Sets</p>
				<div className='bottom_padding'>{processingButton}</div>
				<List
					width='100%'
					height={100}
					itemCount={dataSets.length}
					itemSize={20}
					scrollDirection='vertical'
					renderItem={({index, style}): JSX.Element =>
						<div key={index} style={style} className={index % 2 ? 'list_element_even' : 'list_element_odd'}>
							{dataSets[index].name}
						</div>
					}
				/>
			</div>
		)
	}

	private startProcessing = (): void => {
		this.setState({isProcessing: true})

		const command = [this.localizerPath, this.unprocessedTrajectoriesDir, this.processedTrajectoriesDir].join(' ')

		ChildProcess.exec(command, (error, stdout, stderr) => {
			if (error) {
				log.error(`localizer failed: ${error}`)
				dialog.showErrorBox('Processing error', error.message)
			} else {
				if (stdout) log.info(`localizer stdout: ${stdout}`)
				if (stderr) log.warn(`localizer stderr: ${stderr}`)
			}

			this.setState({isProcessing: false})
		})
	}

	private clearProcessingCheckTimer(): void {
		if (this.processingCheckTimer) {
			window.clearInterval(this.processingCheckTimer)
			this.processingCheckTimer = 0
		}
	}

	// Scan for all available trajectory files on disk.
	private checkTrajectoryDirectories = (): void => {
		const processed = this.loadDirectory(this.processedTrajectoriesDir, trajectoryFileName)
		// Offline Localizer copies items from unprocessed to processed (and hopefully adds a trajectory file).
		// It doesn't consume the unprocessed files. If something appears in both lists, ignore the unprocessed copy.
		const unprocessed = lodash.differenceBy(
			this.loadDirectory(this.unprocessedTrajectoriesDir, s1SessionFileName),
			processed,
			'name'
		)
		const processedDiffs = processed.length !== this.state.processedTrajectories.length ||
			lodash.differenceBy(
				this.state.processedTrajectories,
				processed,
				'name'
			).length
		const unprocessedDiffs = unprocessed.length !== this.state.unprocessedTrajectories.length ||
			lodash.differenceBy(
				this.state.unprocessedTrajectories,
				unprocessed,
				'name'
			).length

		if (processedDiffs || unprocessedDiffs) {
			this.setState({
				processedTrajectories: processed,
				unprocessedTrajectories: unprocessed,
			})
		}
	}
}

// Center it over the main application window.
const trajectoryPickerStyle: Modal.Styles = {
	content: {
		width: '450px',
		top: '50%',
		left: '50%',
		right: 'auto',
		bottom: 'auto',
		marginRight: '-50%',
		transform: 'translate(-50%, -50%)',
	},
	overlay: {
		position: 'fixed',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
}
