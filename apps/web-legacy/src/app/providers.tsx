// app/providers.tsx
'use client'
import {useRouter} from 'next/navigation'
import { Provider } from "react-redux";
import { ThemeProvider } from 'next-themes';
import AntdRegistry from "@/lib/AntdRegistry";
import { ThemeProviderProps } from "next-themes/dist/types";
import {useRef} from "react";
import React from "react";
import {ConfigProvider} from "antd";
import store from "@/store";
import {AppStore} from "@/store";
import {NextUIProvider} from "@nextui-org/react";
import { setUserInfo } from "@/store/user/userSlice";
import { getUserInfo } from "@/store/user/userSlice";


export interface ProvidersProps {
    children: React.ReactNode;
    themeProps?: ThemeProviderProps;
}

export function Providers({ children, themeProps }: ProvidersProps) {
    const router = useRouter()
    const storeRef = useRef<AppStore | null>(null)
    if (!storeRef.current) {
        storeRef.current = store
        // storeRef.current?.dispatch(setUserInfo(getUserInfo()))
    }


    return (
        <Provider store={storeRef.current}>
            <AntdRegistry>
                <ConfigProvider
                    theme={{
                        token: {
                            // Seed Token，影响范围大
                            // colorPrimaryBg: '#01B96B',
                            colorPrimary: '#01B96B',
                        },
                    }}
                >
                    <NextUIProvider navigate={router.push}>
                        <ThemeProvider {...themeProps}>
                            {children}
                        </ThemeProvider>
                    </NextUIProvider>
                </ConfigProvider>
            </AntdRegistry>
        </Provider>
    )
}

// export const Providers = withRedux(({ children, themeProps }: ProvidersProps) => {
//     const { theme, setTheme } = useTheme()
//     const globalTheme = useSelector((state: RootState) => state.theme)
//     const router = useRouter();
//
//     useEffect(() => {
//         console.log(globalTheme)
//         setTheme(globalTheme)
//     }, [globalTheme])
//
//     console.log(themeProps)
//     return (
//         <AntdRegistry>
//             <ThemeProvider {...themeProps}>
//                 <ConfigProvider
//                     theme={{
//                         token: {
//                             // Seed Token，影响范围大
//                             colorPrimary: '#01B96B',
//                         },
//                     }}
//                 >
//                     {children}
//                 </ConfigProvider>
//             </ThemeProvider>
//         </AntdRegistry>
//     )
// })

