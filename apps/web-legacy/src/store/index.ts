import {AnyAction, combineReducers, configureStore, getDefaultMiddleware} from "@reduxjs/toolkit";
import userReducer from "@/store/user/userSlice";
import messageReducer from "@/store/message/messageSlice"
import themeReducer from "@/store/theme/themeSlice"
import sideRouterReducer from "@/store/sideRouter/sideRouterSilce"
// import storage from 'redux-persist/lib/storage'; // defaults to localStorage for web
// import { persistReducer } from 'redux-persist';


const reducer = combineReducers({
    user: userReducer,
    message: messageReducer,
    theme: themeReducer,
    sideRouter: sideRouterReducer
});

// const persistConfig = {
//     key: 'redux',
//     storage,
//     blacklist: ['message']
// };

// const persistedReducer = persistReducer(persistConfig, reducer)



export const makeStore = () => {
    return configureStore({
        reducer: reducer,
        middleware: (getDefaultMiddleware) => [...getDefaultMiddleware({
            serializableCheck: false
        })]
    })
}
const store = makeStore()



export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppStore = ReturnType<typeof makeStore>



export default store
