// Shared joints for lining, shell transitions and frame tubes. Keep the skin
// inside the structural frame instead of sizing it independently of the cage.
export const CABIN={
 sideX:2.5,sideY:.73,sideZ:1.99,sideScaleX:.72,sideScaleY:.78,
 sideFront:1.99-5.9*.72/2,sideRear:1.99+5.9*.72/2,
 sideBottom:.73-5.3*.78/2,sideTop:.73+5.3*.78/2,
 rearZ:1.99+5.9*.72/2,roofY:3.8,roofHalfWidth:1.9,
} as const;

export const FRONT_FRAME=[
 [2.5,CABIN.sideBottom,1.3],[2.5,-.65,1.3],[2.47,.8,-.8],
 [2.43,1.03,-1.04],[2.2,2.1,-2],[1.45,3.55,-2.1],[.7,CABIN.roofY,-1.7],
];
export const ROOF_FRAME=[
 [2.5,CABIN.sideBottom,2],[2.48,1.1,2],[2.45,2.5,2],
 [2.07,3.45,.9],[1.3,3.75,.6],[0,CABIN.roofY,.6],
];
