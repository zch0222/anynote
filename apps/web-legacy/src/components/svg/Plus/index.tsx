'use client'
import { useTheme } from "next-themes";

export default function Plus(props: {
    width: number,
    height: number
}) {

    const {theme} = useTheme()

    return (
        <svg
            style={{
                color: 'var(--color-text)'
            }}
            className="icon"
            viewBox="0 0 1024 1024"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            p-id="4055"
            width={props.width}
            height={props.height}
        >
            <path fill={theme === 'dark' ? 'white' : 'black'} d="M576 64H448v384H64v128h384v384h128V576h384V448H576z" p-id="4035"></path>
        </svg>
    )
}
