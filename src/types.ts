export type IOSConfig = {
    isRoot : boolean
    dependencies : Set<string>
    files : Record<string, string | Buffer>
    tabs : string
}