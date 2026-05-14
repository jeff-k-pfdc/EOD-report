'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  checkAuth:     ()            => ipcRenderer.invoke('check-auth'),
  login:         (password)    => ipcRenderer.invoke('login', password),
  getDraft:      ()            => ipcRenderer.invoke('get-draft'),
  saveDraft:     (data)        => ipcRenderer.invoke('save-draft', data),
  clearDraft:    ()            => ipcRenderer.invoke('clear-draft'),
  getHistory:    ()            => ipcRenderer.invoke('get-history'),
  deleteHistory: (index)       => ipcRenderer.invoke('delete-history', index),
  submit:        (date, notes) => ipcRenderer.invoke('submit', date, notes),
  getSettings:   ()            => ipcRenderer.invoke('get-settings'),
  saveSettings:  (s)           => ipcRenderer.invoke('save-settings', s),
})
