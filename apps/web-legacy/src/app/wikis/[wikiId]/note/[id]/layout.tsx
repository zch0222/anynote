import React from "react";


export default function NoteLayout({children}: {
    children: React.ReactNode
}) {

    return (
        <div className="w-full h-full">
            {children}
        </div>
    )
}
