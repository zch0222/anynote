'use client'
import { useTheme } from "next-themes";

export default function Back(props: {
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
            <path fill={theme === 'dark' ? 'white' : 'black'} d="M395.21518 513.604544l323.135538-312.373427c19.052938-18.416442 19.052938-48.273447 0-66.660212-19.053961-18.416442-49.910737-18.416442-68.964698 0L291.75176 480.290811c-19.052938 18.416442-19.052938 48.273447 0 66.660212l357.633237 345.688183c9.525957 9.207709 22.01234 13.796214 34.497699 13.796214 12.485359 0 24.971741-4.588505 34.466999-13.82896 19.052938-18.416442 19.052938-48.242747 0-66.660212L395.21518 513.604544z" p-id="5370"></path>
        </svg>
    )

}

