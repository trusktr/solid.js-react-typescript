/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import './TrajectoryPicker.scss'
import config from '@/config'
import * as React from 'react'
import * as Modal from 'react-modal'
import * as Electron from 'electron'
import Logger from '@/util/log'
import * as Fs from "fs"
import * as AsyncFile from "async-file"
import * as Executable from 'executable'
import * as ChildProcess from 'child_process'
import {TrajectoryDataSet, trajectoryFileName} from "@/util/Perception"

const VirtualList = require('react-tiny-virtual-list')

const log = Logger(__filename)

const dialog = Electron.remote.dialog

export type TrajectoryFileSelectedCallback = (path: string) => void

interface TrajectoryPickerProps {
}

interface TrajectoryPickerState {
	enabled: boolean
	isOpen: boolean
	isProcessing: boolean
	unprocessedTrajectoryCount: number
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
		this.processedTrajectoriesDir = config.get('fly_through.trajectory_picker.processed_trajectories_dir')
		this.unprocessedTrajectoriesDir = config.get('fly_through.trajectory_picker.unprocessed_trajectories_dir')
		this.localizerPath = config.get('perception.offline_localizer_path')
		this.clearProcessingCheckTimer()

		this.state = {
			enabled: false,
			isOpen: false,
			isProcessing: false,
			unprocessedTrajectoryCount: 0,
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
		if (!this.state.enabled || !this.state.isOpen)
			return <div/>

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

		if (this.onTrajectoryFileSelected)
			log.error('trajectoryFileSelected callback should not be present in openModal()')

		this.onTrajectoryFileSelected = cb
		this.setState({isOpen: true})
	}

	private closeModal = (): void => {
		this.onTrajectoryFileSelected = null
		this.setState({isOpen: false})
	}

	private playTrajectory(path: string): () => void {
		return (): void => {
			if (this.onTrajectoryFileSelected)
				this.onTrajectoryFileSelected(path)
			this.closeModal()
		}
	}

	private loadDirectory(dataSetRoot: string): TrajectoryDataSet[] {
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
					path: [dataSetRoot, name, trajectoryFileName].join('/'),
				} as TrajectoryDataSet
			})
			.filter(dataSet => Fs.existsSync(dataSet.path))
	}

	private processed(): JSX.Element {
		const dataSets = this.loadDirectory(this.processedTrajectoriesDir)
		if (!dataSets.length)
			return <div><em>No processed data sets are available.</em></div>

		return (
			<div>
				<h3>Processed</h3>
				<p className='center'>{dataSets.length} Data Sets</p>
				<VirtualList
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
		const dataSets = this.loadDirectory(this.unprocessedTrajectoriesDir)
		if (!dataSets.length)
			return <div/>

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
				<VirtualList
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
		const command = [this.localizerPath, this.unprocessedTrajectoriesDir, this.processedTrajectoriesDir].join(' ')
		ChildProcess.exec(command, (error, stdout, stderr) => {
			if (error) {
				log.error(`localizer failed: ${error}`)
				dialog.showErrorBox('Processing error', error.message)
			} else {
				if (stdout) log.info(`localizer stdout: ${stdout}`)
				if (stderr) log.warn(`localizer stderr: ${stderr}`)
				this.setState({isProcessing: true})
				if (!this.processingCheckTimer)
					this.processingCheckTimer = window.setInterval(this.handleProcessingCheckTimer, 30000)
			}
		})
	}

	private handleProcessingCheckTimer = (): void => {
		if (this.state.isProcessing && this.checkForUnprocessedTrajectories()) {
			// Keep checking until there are no unprocessed data sets left.
		} else {
			this.clearProcessingCheckTimer()
		}
	}

	private clearProcessingCheckTimer(): void {
		if (this.processingCheckTimer) {
			window.clearInterval(this.processingCheckTimer)
			this.processingCheckTimer = 0
		}
	}

	private checkForUnprocessedTrajectories(): boolean {
		const dataSets = this.loadDirectory(this.unprocessedTrajectoriesDir)
		if (dataSets.length) {
			if (dataSets.length !== this.state.unprocessedTrajectoryCount)
				this.setState({unprocessedTrajectoryCount: dataSets.length})
			return true
		} else {
			this.setState({isProcessing: false, unprocessedTrajectoryCount: 0})
			return false
		}
	}
}

// Center it over the main application window.
const trajectoryPickerStyle: Modal.Styles = {
	content: {
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
		backgroundColor: 'rgba(0, 0, 0, 0.5)'
	},
}
