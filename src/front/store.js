export const initialStore = () => ({
  message: "",
  currentUser: null
})

export default function storeReducer(state, action) {
  switch (action.type) {
    case "set_hello":
      return { ...state, message: action.payload }
    case "set_user":
      return { ...state, currentUser: action.payload }
    case "logout":
      return { ...state, currentUser: null }
    default:
      return state
  }
}
