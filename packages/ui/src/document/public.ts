export interface DocumentListItemView {readonly id:string;readonly documentNo:string;readonly versionNo:number;readonly state:string;readonly securityLevel:"L1"|"L2"|"L3"|"L4"}
export type DocumentListView={readonly availability:"AVAILABLE";readonly items:readonly DocumentListItemView[];readonly message:string}|{readonly availability:"UNAVAILABLE";readonly items:readonly[];readonly message:string};
export function unavailableDocumentList():DocumentListView{return{availability:"UNAVAILABLE",items:[],message:"문서 조회 서비스가 아직 연결되지 않았습니다. 빈 문서함으로 간주하지 않습니다."};}
export function availableDocumentList(items:readonly DocumentListItemView[]):DocumentListView{return{availability:"AVAILABLE",items:items.map(x=>({...x})),message:items.length?"문서가 있습니다.":"현재 문서가 없습니다."};}
