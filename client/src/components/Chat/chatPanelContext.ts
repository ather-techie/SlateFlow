import { createContext } from 'react'

/**
 * Lets Header (rendered by pages inside Layout's <Outlet>) toggle the chat
 * panel whose open state lives in Layout. Provided by Layout.
 */
export interface ChatPanelControl {
  open: boolean
  setOpen: (open: boolean) => void
}

export const ChatPanelContext = createContext<ChatPanelControl | null>(null)
