import './style.css'
import { App } from './app'

const root = document.getElementById('app')
if (!root) {
  throw new Error('Missing #app root element')
}
new App(root)
